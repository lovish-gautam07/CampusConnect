const { randomUUID } = require("crypto");
const { GetCommand, PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const { db, tables } = require("../config/aws");

const JOB_TYPES = ["Full Time", "Internship", "Part Time"];
const JOB_STATUSES = ["Open", "Closed"];
const STATUS_INDEX = "status-createdAt-index";

// DynamoDB's contains() is case-sensitive, so each job also stores
// lower-case copies of the fields people search on.
const searchFields = (job) => ({
    companyLower: job.company.toLowerCase(),
    roleLower: job.role.toLowerCase(),
    locationLower: job.location.toLowerCase()
});

// What the API sends to the browser: no search copies, plus `_id` so the
// React pages written for MongoDB keep working unchanged.
const toPublic = (job) => {
    if (!job) return null;

    const { companyLower, roleLower, locationLower, ...rest } = job;
    return { _id: job.id, ...rest };
};

// `id`, `createdAt` and `updatedAt` are only passed by the Atlas copy script.
const createJob = async ({ id, createdAt, updatedAt, ...fields }) => {
    const now = new Date().toISOString();

    const job = {
        id: id || randomUUID(),
        company: fields.company,
        role: fields.role,
        description: fields.description,
        location: fields.location,
        jobType: fields.jobType || "Full Time",
        package: fields.package,
        eligibility: fields.eligibility || "As per company requirements",
        requiredSkills: fields.requiredSkills || [],
        applicationDeadline: fields.applicationDeadline,
        status: fields.status || "Open",
        postedBy: fields.postedBy,
        createdAt: createdAt || now,
        updatedAt: updatedAt || createdAt || now
    };

    await db.send(new PutCommand({
        TableName: tables.jobs,
        Item: { ...job, ...searchFields(job) },
        ConditionExpression: "attribute_not_exists(id)"
    }));

    return job;
};

const findJobById = async (id) => {
    if (!id) return null;

    const { Item } = await db.send(new GetCommand({
        TableName: tables.jobs,
        Key: { id: String(id) }
    }));

    return Item || null;
};

// Open jobs, newest first, with the same optional filters as before:
// `search` matches company or role, `location` is a partial match,
// `jobType` is an exact match.
const listOpenJobs = async ({ search, location, jobType } = {}) => {
    const filters = [];
    const names = { "#status": "status" };
    const values = { ":open": "Open" };

    if (search) {
        filters.push("(contains(#companyLower, :search) OR contains(#roleLower, :search))");
        names["#companyLower"] = "companyLower";
        names["#roleLower"] = "roleLower";
        values[":search"] = search.toLowerCase();
    }

    if (location) {
        filters.push("contains(#locationLower, :location)");
        names["#locationLower"] = "locationLower";
        values[":location"] = location.toLowerCase();
    }

    if (jobType) {
        filters.push("#jobType = :jobType");
        names["#jobType"] = "jobType";
        values[":jobType"] = jobType;
    }

    const jobs = [];
    let ExclusiveStartKey;

    do {
        const page = await db.send(new QueryCommand({
            TableName: tables.jobs,
            IndexName: STATUS_INDEX,
            KeyConditionExpression: "#status = :open",
            ...(filters.length && { FilterExpression: filters.join(" AND ") }),
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
            ScanIndexForward: false,
            ExclusiveStartKey
        }));

        jobs.push(...page.Items);
        ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    return jobs;
};

module.exports = {
    JOB_TYPES,
    JOB_STATUSES,
    toPublic,
    createJob,
    findJobById,
    listOpenJobs
};
