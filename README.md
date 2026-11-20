# CampusConnect

A web portal for campus placements. Students register, browse jobs and upload their resume. Admins and recruiters post jobs, and admins manage student accounts and view resumes.

- **Frontend:** React + Vite (`frontend/`)
- **Backend:** Express API (`backend/`) running on **AWS Lambda** behind **API Gateway**
- **Data:** **Amazon DynamoDB** for users and jobs, **Amazon S3** for resumes
- **Infrastructure:** one AWS SAM template, [`template.yaml`](template.yaml)

Deploying, copying the old MongoDB Atlas data, and running it locally are covered in **[AWS_SETUP.md](AWS_SETUP.md)**.

## API

| Method | Path | Who |
|---|---|---|
| POST | `/api/auth/register` | anyone (creates a student) |
| POST | `/api/auth/login` | anyone |
| POST | `/api/auth/create-admin` | once, with the admin setup key |
| GET | `/api/jobs` (`?search=&location=&jobType=`) | anyone |
| GET | `/api/jobs/:id` | anyone |
| POST | `/api/jobs` | admin, recruiter |
| GET | `/api/admin/students` | admin |
| DELETE | `/api/admin/students/:id` | admin |
| GET | `/api/admin/students/:id/resume` | admin |
| POST | `/api/students/me/resume/upload-url` | student |
| POST / GET / DELETE | `/api/students/me/resume` | student |

Requests that need a login send `Authorization: Bearer <token>`.
