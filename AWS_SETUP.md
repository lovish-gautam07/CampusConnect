# Running CampusConnect on AWS

This guide moves the CampusConnect backend from Render and MongoDB Atlas to AWS, using an **AWS Academy Learner Lab** account.

| Part | Before | On AWS |
|---|---|---|
| API (Express) | Render | **AWS Lambda** behind **Amazon API Gateway** (HTTP API) |
| Users and jobs | MongoDB Atlas | **Amazon DynamoDB** (two tables) |
| Student resumes | – | **Amazon S3** (private bucket) |
| Setup | Render dashboard | One **AWS SAM** template: [`template.yaml`](template.yaml) |

```
Browser (React)
   │  HTTPS + JWT
   ▼
API Gateway ──► Lambda (Express app) ──► DynamoDB: users table, jobs table
   │                     │
   │                     └─ signs short-lived S3 upload forms and view links
   ▼
S3 resume bucket ◄── browser uploads the PDF directly, using the signed form
```

AWS renames console menus from time to time. If a label below doesn't match exactly, look for the nearest equivalent.

## Before you start: change the leaked passwords

Until this branch, `backend/.env` was committed to the public GitHub repo. It held the MongoDB Atlas password, the JWT secret and the admin setup key. This branch stops tracking the file, but it is still in the repo's history, so anyone can read those values.

1. In MongoDB Atlas, open **Database Access** and change the password of the database user in `MONGO_URI`. Update it on Render too, so the old backend keeps working until you switch over.
2. Use **new** values for `JWT_SECRET` and `ADMIN_SETUP_KEY` on AWS (step 3). Don't reuse the old ones.

## 1. Install the tools

You need Node.js 22 or newer, the AWS CLI and the AWS SAM CLI.

- **macOS:** `brew install awscli aws-sam-cli`
- **Windows:** install the [AWS CLI MSI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and the [SAM CLI MSI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html).

Check that they work:

```bash
aws --version
sam --version
```

## 2. Start the lab and connect the CLI

1. In AWS Academy, open **Learner Lab** and choose **Start Lab**. Wait until the dot next to **AWS** turns green.
2. Choose **AWS Details**, then **Show** next to **AWS CLI**.
3. Copy the whole block (`[default]`, `aws_access_key_id`, `aws_secret_access_key`, `aws_session_token`) into the file `~/.aws/credentials` (on Windows, `C:\Users\<you>\.aws\credentials`). Replace whatever is there.
4. Check it:

   ```bash
   aws sts get-caller-identity
   ```

   The ARN should contain `assumed-role/voclabs`.

**These keys stop working when the lab session ends (about 4 hours).** Each time you start the lab again, repeat steps 2 and 3 before running `sam` or `aws` commands.

Learner Lab rules that shape this setup:

- **Region:** only `us-east-1` (N. Virginia) and `us-west-2` (Oregon) are allowed. This guide uses `us-east-1`.
- **No new IAM roles:** the Lambda function runs as the lab's built-in `LabRole`, which is the template's default.
- **Budget:** the lab has a fixed credit. At college scale this stack costs cents: Lambda, API Gateway and DynamoDB charge per request, and S3 holds a few MB of PDFs. Watch the budget shown on the lab page.

## 3. Make two secrets

Run this twice and keep both outputs somewhere private:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The first is your **JWT secret** (signs login tokens). The second is your **admin setup key** (needed once, to create the first admin).

## 4. Deploy

From the repository root (the folder that holds `template.yaml`):

```bash
sam build
```

```bash
sam deploy --guided
```

Answer the questions like this:

| Question | Answer |
|---|---|
| Stack Name | `campusconnect` |
| AWS Region | `us-east-1` |
| Parameter JwtSecret | your first secret |
| Parameter AdminSetupKey | your second secret |
| Parameter AllowedOrigins | your frontend address plus local dev, comma-separated with **no spaces** and no trailing `/`, for example `https://campusconnect.vercel.app,http://localhost:5173`. Use `*` while testing. |
| Parameter LambdaRoleName | `LabRole` (press Enter) |
| Confirm changes before deploy | `y` |
| Allow SAM CLI IAM role creation | `n` (the lab can't create roles, and this template doesn't need any). If it then asks for **Capabilities**, press Enter. |
| Disable rollback | `n` |
| ApiFunction has no authentication. Is this okay? | `y` (the Express app checks login tokens itself) |
| Save arguments to configuration file | `y` |

When it asks **Deploy this changeset?**, answer `y`. It takes 2 to 4 minutes. At the end it prints **Outputs**:

- `ApiUrl`: the backend address, for example `https://abc123.execute-api.us-east-1.amazonaws.com/api`
- `UsersTableName`, `JobsTableName`: the two DynamoDB tables
- `ResumeBucketName`: the S3 bucket for resumes

Check the backend is live (open `ApiUrl` without the `/api` at the end):

```bash
curl https://abc123.execute-api.us-east-1.amazonaws.com/
```

It should answer `CampusConnect Backend is Running Successfully!`

`samconfig.toml` now holds your answers, including the secrets. It is in `.gitignore`; keep it out of git. Later deploys are just `sam build` then `sam deploy`.

If `sam deploy` says the runtime `nodejs24.x` isn't supported, change `Runtime` in `template.yaml` to `nodejs22.x` and deploy again.

## 5. Copy the existing data from Atlas (optional)

Skip this if you want to start with an empty database.

The script copies every user and job. Users keep their MongoDB id and their password hash, so **everyone logs in with the same email and password as before**. Running it twice is safe: it skips what's already copied.

1. In `backend/`, run `npm install`.
2. Make `backend/.env` from [`backend/.env.example`](backend/.env.example) and set:
   - `MONGO_URI`: the Atlas connection string (with the new password)
   - `USERS_TABLE` and `JOBS_TABLE`: the names from the deploy outputs
   - `AWS_REGION=us-east-1`
   - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`: from **AWS Details** in the lab
   - delete the `DYNAMODB_ENDPOINT` line, so the script writes to AWS and not to DynamoDB Local
3. Count first, then copy:

   ```bash
   npm run copy-from-atlas -- --dry-run
   ```

   ```bash
   npm run copy-from-atlas
   ```

If the old database had an admin, that admin comes across too, and you can skip step 6.

## 6. Create the first admin

Skip this if you copied an admin in step 5. Replace the address, email, password and key:

```bash
curl -X POST https://abc123.execute-api.us-east-1.amazonaws.com/api/auth/create-admin \
  -H "Content-Type: application/json" \
  -d '{"name":"Placement Cell","email":"admin@college.edu","password":"a-strong-password","setupKey":"YOUR_ADMIN_SETUP_KEY"}'
```

This works only once: after an admin exists, the endpoint refuses.

## 7. Point the frontend at AWS

The frontend reads the backend address from `VITE_API_URL`.

- **Hosted frontend (Vercel, Netlify, Amplify):** add an environment variable `VITE_API_URL` set to `ApiUrl`, then redeploy the frontend.
- **Or in the repo:** create `frontend/.env.production` with `VITE_API_URL=<ApiUrl>` and commit it. The address isn't secret.

If you used `*` for AllowedOrigins, switch to the real frontend address now: run `sam deploy --guided` again and change only that answer. The same list controls which sites may upload resumes to S3.

## 8. See it in the AWS console

- **Lambda → Functions → campusconnect-ApiFunction-… → Monitor → View CloudWatch logs:** every request, and the error details the API doesn't send to browsers.
- **DynamoDB → Explore items:** pick the users or jobs table. In the users table, items whose `id` starts with `EMAIL#` are email locks (see below), not extra users.
- **S3 → Buckets → campusconnect-resumebucket-… → resumes/:** one folder per student.
- **API Gateway → APIs → campusconnect:** the HTTP API that sends every request to Lambda.

Data in DynamoDB and S3 stays between lab sessions. Before a demo, open the API address to check it answers. If it doesn't, start the lab first.

## How it works (useful for a viva)

**Why Lambda and not a server?** Lambda runs the Express app only when a request arrives and charges per request, so an idle college project costs nothing. [`backend/lambda.js`](backend/lambda.js) wraps the same Express app with `serverless-http`; [`backend/server.js`](backend/server.js) runs it on a normal port for local development. The first request after an idle spell takes about a second longer (a "cold start").

**DynamoDB tables.** Each table's key is `id`. Two secondary indexes answer the app's list queries without scanning the whole table:

- users `role-createdAt-index`: all students, newest first (admin page)
- jobs `status-createdAt-index`: open jobs, newest first (Find Jobs)

**Unique emails.** DynamoDB has no "unique" constraint like MongoDB's. Registration writes two items in one transaction: the user, and an "email lock" item whose id is `EMAIL#<email>`. If the lock already exists, the whole transaction fails, so two people can never register the same email, even at the same moment. Login reads the lock to find the user.

**Search.** DynamoDB's `contains()` is case-sensitive, so each job also stores lower-case copies of company, role and location. Search text is matched literally, which also removes the old risk of someone sending a slow regular expression.

**Resumes.** The bucket is private.

1. The student's browser asks the API for a signed upload form. The form only allows one file name, a PDF, up to 5 MB, and expires in 5 minutes.
2. The browser uploads the PDF straight to S3, so the file never passes through Lambda.
3. The API checks the file exists, its size, and that it starts with `%PDF-`, then saves it on the student's profile. Anything else is deleted.
4. Viewing uses a signed link that expires in 5 minutes.

## Local development

You can run everything on your computer with Docker and no AWS account. Resume uploads are the exception: they need the real S3 bucket.

```bash
cd backend
npm install
cp .env.example .env        # then fill in JWT_SECRET and ADMIN_SETUP_KEY
npm run db:local            # terminal 1: DynamoDB Local on port 8000
npm run db:setup            # terminal 2: create the tables
npm run dev                 # API on http://localhost:5000
```

```bash
cd frontend
npm install
npm run dev                 # uses http://localhost:5000/api unless VITE_API_URL is set
```

To try resume uploads locally, set `RESUME_BUCKET` to the deployed bucket name and put the lab's AWS keys (including `AWS_SESSION_TOKEN`) in `backend/.env`.

**Tests** run against DynamoDB Local, with S3 faked:

```bash
npm test
```

To include the Atlas copy test, start a throwaway MongoDB and point the tests at it:

```bash
docker run -d --rm -p 27099:27017 mongo:7
```

```bash
TEST_MONGO_URI=mongodb://localhost:27099 npm test
```

## Removing everything

```bash
sam delete
```

This removes the Lambda function and the API. The two tables and the resume bucket are **kept** on purpose, so a mistaken delete can't wipe student data. Delete them by hand in the DynamoDB and S3 consoles if you really want them gone.

## Using a personal AWS account instead

Everything works the same except the role. Create an IAM role for Lambda with the `AWSLambdaBasicExecutionRole` policy plus read/write access to the two tables and the bucket, then give its name as `LambdaRoleName` when you deploy. You can use any region.
