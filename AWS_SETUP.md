# Running CampusConnect on AWS

This guide moves the CampusConnect backend from Render and MongoDB Atlas to AWS.

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

## Which AWS account?

Either works. Where the steps differ, this guide shows both.

| | Your own AWS account (recommended) | AWS Academy Learner Lab |
|---|---|---|
| How you get it | Sign up yourself (step 1) | Your teacher invites you |
| Signing in from the terminal | `aws login` in the browser | Copy keys from **AWS Details**; they expire after about 4 hours |
| Region | `ap-south-1` (Mumbai), close to Indian users | `us-east-1` only (or `us-west-2`) |
| Lambda permissions | The stack creates a role with only what the API needs | Uses the lab's built-in `LabRole` |

## About the old passwords

The first version of this project committed `backend/.env` (MongoDB Atlas password, JWT secret, admin setup key) to Harsh's public repo. This repo's history was cleaned before its first push, so the file isn't here, but it is still readable in the original repo.

1. In MongoDB Atlas, open **Database Access** and change the password of the database user in `MONGO_URI`.
2. On AWS, use **new** values for `JWT_SECRET` and `ADMIN_SETUP_KEY` (step 4).

## 1. Get an AWS account

**Your own account:**

1. Go to <https://aws.amazon.com/free> and choose **Create an AWS account**.
2. Enter your email and an account name, then verify the email with the code AWS sends.
3. Set the root password and fill in your contact details (choose **Personal**).
4. Add a debit or credit card. It is for identity checks; Indian cards see a small refundable charge (about ₹2), and the card needs online/international payments turned on.
5. Verify your phone number.
6. Choose the **Free plan** when asked. It comes with free credits for the first months and doesn't charge your card. Check the current offer on the sign-up page.
7. Optional but wise: in the console, search **Budgets**, choose **Create budget**, then the **Zero spend budget** template. AWS emails you if anything ever starts to cost money.

**Learner Lab:** accept your teacher's AWS Academy invitation, then sign in at <https://awsacademy.instructure.com>.

## 2. Install the tools

You need Node.js 22 or newer, the AWS CLI and the AWS SAM CLI.

- **macOS:** `brew install awscli aws-sam-cli`
- **Windows:** install the [AWS CLI MSI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and the [SAM CLI MSI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html).

Check that they work:

```bash
aws --version
```

```bash
sam --version
```

## 3. Connect the terminal to your account

**Your own account:**

```bash
aws login
```

A browser window opens. Sign in the same way you sign in to the AWS console. If the terminal asks for a region, enter `ap-south-1`. The sign-in lasts for hours and renews itself; run `aws login` again if a command later says your session expired.

If `aws login` doesn't work for your account, use an access key instead:

1. In the console, open **IAM → Users → Create user**. Name it `campusconnect-admin` and attach the **AdministratorAccess** policy.
2. Open the user, go to **Security credentials → Create access key**, and choose **Command Line Interface (CLI)**.
3. Run `aws configure` and paste the two keys when asked. Region: `ap-south-1`.

**Learner Lab:**

1. Open the lab and choose **Start Lab**. Wait until the dot next to **AWS** turns green.
2. Choose **AWS Details**, then **Show** next to **AWS CLI**.
3. Copy the whole block (`[default]` through the long `aws_session_token`) into `~/.aws/credentials` (on Windows, `C:\Users\<you>\.aws\credentials`), replacing what's there.
4. Repeat these steps each time you start the lab: the keys stop working when the session ends (about 4 hours).

**Check it worked** (either account):

```bash
aws sts get-caller-identity
```

It prints your account number and who you're signed in as.

## 4. Make two secrets

Run this twice and keep both outputs somewhere private:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The first is your **JWT secret** (signs login tokens). The second is your **admin setup key** (needed once, to create the first admin).

## 5. Deploy

From the repository root (the folder that holds `template.yaml`):

```bash
sam build
```

```bash
sam deploy --guided
```

Answer the questions like this:

| Question | Your own account | Learner Lab |
|---|---|---|
| Stack Name | `campusconnect` | `campusconnect` |
| AWS Region | `ap-south-1` | `us-east-1` |
| Parameter JwtSecret | your first secret | same |
| Parameter AdminSetupKey | your second secret | same |
| Parameter AllowedOrigins | frontend address plus local dev, comma-separated with **no spaces** and no trailing `/`, e.g. `https://campusconnect.vercel.app,http://localhost:5173`. Use `*` while testing. | same |
| Parameter LambdaRoleName | leave empty (press Enter) | `LabRole` |
| Confirm changes before deploy | `y` | `y` |
| Allow SAM CLI IAM role creation | `y` | `n` (if it then asks for **Capabilities**, press Enter) |
| Disable rollback | `n` | `n` |
| ApiFunction has no authentication. Is this okay? | `y` (the Express app checks login tokens itself) | `y` |
| Save arguments to configuration file | `y` | `y` |

When it asks **Deploy this changeset?**, answer `y`. It takes 2 to 4 minutes. At the end it prints **Outputs**:

- `ApiUrl`: the backend address, for example `https://abc123.execute-api.ap-south-1.amazonaws.com/api`
- `UsersTableName`, `JobsTableName`: the two DynamoDB tables
- `ResumeBucketName`: the S3 bucket for resumes

Check the backend is live (open `ApiUrl` without the `/api` at the end):

```bash
curl https://abc123.execute-api.ap-south-1.amazonaws.com/
```

It should answer `CampusConnect Backend is Running Successfully!`

`samconfig.toml` now holds your answers, including the secrets. It is in `.gitignore`; keep it out of git. Later deploys are just `sam build` then `sam deploy`.

## 6. Copy the existing data from Atlas (optional)

Skip this if you want to start with an empty database.

The script copies every user and job. Users keep their MongoDB id and their password hash, so **everyone logs in with the same email and password as before**. Running it twice is safe: it skips what's already copied.

1. In `backend/`, run `npm install`.
2. Make `backend/.env` from [`backend/.env.example`](backend/.env.example) and set:
   - `MONGO_URI`: the Atlas connection string (with the new password)
   - `USERS_TABLE` and `JOBS_TABLE`: the names from the deploy outputs
   - `AWS_REGION`: the region you deployed to
3. In the same file, **delete** the `DYNAMODB_ENDPOINT`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` lines, so the script writes to AWS using the account you signed in with in step 3.
4. Count first, then copy:

   ```bash
   npm run copy-from-atlas -- --dry-run
   ```

   ```bash
   npm run copy-from-atlas
   ```

If the old database had an admin, that admin comes across too, and you can skip step 7.

## 7. Create the first admin

Skip this if you copied an admin in step 6. Replace the address, email, password and key:

```bash
curl -X POST https://abc123.execute-api.ap-south-1.amazonaws.com/api/auth/create-admin \
  -H "Content-Type: application/json" \
  -d '{"name":"Placement Cell","email":"admin@college.edu","password":"a-strong-password","setupKey":"YOUR_ADMIN_SETUP_KEY"}'
```

This works only once: after an admin exists, the endpoint refuses.

## 8. Point the frontend at AWS

The frontend reads the backend address from `VITE_API_URL`.

- **Hosted frontend (Vercel, Netlify, Amplify):** add an environment variable `VITE_API_URL` set to `ApiUrl`, then redeploy the frontend.
- **Or in the repo:** create `frontend/.env.production` with `VITE_API_URL=<ApiUrl>` and commit it. The address isn't secret.

If you used `*` for AllowedOrigins, switch to the real frontend address now: run `sam deploy --guided` again and change only that answer. The same list controls which sites may upload resumes to S3.

## 9. See it in the AWS console

Pick the region you deployed to (top right of the console) first.

- **Lambda → Functions → campusconnect-ApiFunction-… → Monitor → View CloudWatch logs:** every request, and the error details the API doesn't send to browsers.
- **DynamoDB → Explore items:** pick the users or jobs table. In the users table, items whose `id` starts with `EMAIL#` are email locks (see below), not extra users.
- **S3 → Buckets → campusconnect-resumebucket-… → resumes/:** one folder per student.
- **API Gateway → APIs → campusconnect:** the HTTP API that sends every request to Lambda.
- **CloudFormation → Stacks → campusconnect:** everything the template created, in one place.

On Learner Lab, data in DynamoDB and S3 stays between lab sessions. Before a demo, open the API address to check it answers. If it doesn't, start the lab first.

## How it works (useful for a viva)

**Why Lambda and not a server?** Lambda runs the Express app only when a request arrives and charges per request, so an idle college project costs nothing. [`backend/lambda.js`](backend/lambda.js) wraps the same Express app with `serverless-http`; [`backend/server.js`](backend/server.js) runs it on a normal port for local development. The first request after an idle spell takes about a second longer (a "cold start").

**Least privilege.** On a normal account the template creates the function's IAM role with only what it uses: writing logs, reading and writing the two tables, and handling files under `resumes/` in the bucket.

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

To try resume uploads locally, set `RESUME_BUCKET` to the deployed bucket name, and delete the `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` lines from `backend/.env` so the API uses your signed-in AWS account.

**Tests** run against DynamoDB Local, with S3 faked:

```bash
npm test
```

If port 8000 is busy, run DynamoDB Local on another port and tell the tests, e.g. `TEST_DYNAMODB_ENDPOINT=http://localhost:8011 npm test`.

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

This removes the Lambda function, its role and the API. The two tables and the resume bucket are **kept** on purpose, so a mistaken delete can't wipe student data. Delete them by hand in the DynamoDB and S3 consoles if you really want them gone.
