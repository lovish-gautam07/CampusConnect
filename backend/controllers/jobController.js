
const Job = require("../models/Job");

const text = (value) =>
    value === undefined || value === null ? "" : String(value).trim();

// Accepts ["React", "Node"] or "React, Node"
const skillList = (value) => {
    const items = Array.isArray(value) ? value : text(value).split(",");
    return items.map((skill) => text(skill)).filter(Boolean);
};

// A query string value, or "" when missing. Repeated keys use the first value.
const queryText = (value) => text(Array.isArray(value) ? value[0] : value);

// Create a new job
const createJob = async (req, res) => {
    try {
        const body = req.body || {};

        const company = text(body.company);
        const role = text(body.role);
        const description = text(body.description);
        const location = text(body.location);
        const salaryPackage = text(body.package);

        if (!company || !role || !description || !location || !salaryPackage) {
            return res.status(400).json({
                message: "Please provide all required job details."
            });
        }

        if (body.jobType && !Job.JOB_TYPES.includes(body.jobType)) {
            return res.status(400).json({
                message: `Job type must be one of: ${Job.JOB_TYPES.join(", ")}.`
            });
        }

        let applicationDeadline;

        if (body.applicationDeadline) {
            const deadline = new Date(body.applicationDeadline);

            if (Number.isNaN(deadline.getTime())) {
                return res.status(400).json({
                    message: "Application deadline is not a valid date."
                });
            }

            applicationDeadline = deadline.toISOString();
        }

        const job = await Job.createJob({
            company,
            role,
            description,
            location,
            jobType: body.jobType,
            package: salaryPackage,
            eligibility: text(body.eligibility),
            requiredSkills: skillList(body.requiredSkills),
            applicationDeadline,
            postedBy: req.user.id
        });

        res.status(201).json({
            message: "Job posted successfully!",
            job: Job.toPublic(job)
        });

    } catch (error) {
        console.error("Create Job Error:", error);

        res.status(500).json({
            message: "Failed to create job."
        });
    }
};

// Get all jobs with optional filters
const getAllJobs = async (req, res) => {
    try {
        const jobs = await Job.listOpenJobs({
            search: queryText(req.query.search),
            location: queryText(req.query.location),
            jobType: queryText(req.query.jobType)
        });

        res.status(200).json({
            count: jobs.length,
            jobs: jobs.map(Job.toPublic)
        });

    } catch (error) {
        console.error("List Jobs Error:", error);

        res.status(500).json({
            message: "Failed to fetch jobs."
        });
    }
};

// Get a single job by ID
const getJobById = async (req, res) => {
    try {
        const job = await Job.findJobById(req.params.id);

        if (!job) {
            return res.status(404).json({
                message: "Job not found."
            });
        }

        res.status(200).json({ job: Job.toPublic(job) });

    } catch (error) {
        console.error("Get Job Error:", error);

        res.status(500).json({
            message: "Failed to fetch job."
        });
    }
};

module.exports = {
    createJob,
    getAllJobs,
    getJobById
};
