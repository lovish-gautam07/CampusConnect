const User = require("../models/User");
const resumes = require("../storage/resumes");

// Step 1 of an upload: give the browser a signed form for S3.
const getUploadForm = async (req, res) => {
    try {
        const fileSize = Number(req.body?.fileSize);

        if (fileSize && fileSize > resumes.MAX_RESUME_BYTES) {
            return res.status(400).json({
                message: "The resume must be a PDF of 5 MB or less."
            });
        }

        const form = await resumes.createUploadForm(req.user.id);

        res.status(200).json(form);

    } catch (error) {
        console.error("Resume Upload Form Error:", error);

        res.status(500).json({
            message: "Could not start the upload. Please try again."
        });
    }
};

// Step 2 of an upload: after the browser has sent the file to S3, check it
// and save it on the student's profile, replacing any older resume.
const saveResume = async (req, res) => {
    const { key, fileName } = req.body || {};

    try {
        if (!resumes.isOwnKey(req.user.id, key)) {
            return res.status(400).json({
                message: "Invalid upload."
            });
        }

        const student = await User.findById(req.user.id);

        if (!student || student.role !== "student") {
            return res.status(404).json({
                message: "Student not found."
            });
        }

        const check = await resumes.checkUploadedResume(key);

        if (!check.ok) {
            await resumes.deleteResumeFile(key).catch(() => {});

            return res.status(400).json({
                message: check.reason
            });
        }

        const resume = {
            key,
            fileName: resumes.safeFileName(fileName),
            size: check.size,
            uploadedAt: new Date().toISOString()
        };

        await User.setResume(student.id, resume);

        const oldKey = student.resume?.key;

        if (oldKey && oldKey !== key) {
            await resumes.deleteResumeFile(oldKey).catch((error) =>
                console.error("Old Resume Delete Error:", error)
            );
        }

        res.status(200).json({
            message: "Resume uploaded successfully!",
            resume
        });

    } catch (error) {
        console.error("Resume Save Error:", error);

        res.status(500).json({
            message: "Could not save the resume. Please try again."
        });
    }
};

const getMyResume = async (req, res) => {
    try {
        const student = await User.findById(req.user.id);

        if (!student?.resume) {
            return res.status(200).json({ resume: null });
        }

        res.status(200).json({
            resume: student.resume,
            url: await resumes.createViewLink(student.resume)
        });

    } catch (error) {
        console.error("Resume Read Error:", error);

        res.status(500).json({
            message: "Could not load the resume."
        });
    }
};

const deleteMyResume = async (req, res) => {
    try {
        const student = await User.findById(req.user.id);

        if (!student?.resume) {
            return res.status(404).json({
                message: "No resume to delete."
            });
        }

        await User.setResume(student.id, null);
        await resumes.deleteResumeFile(student.resume.key);

        res.status(200).json({
            message: "Resume deleted."
        });

    } catch (error) {
        console.error("Resume Delete Error:", error);

        res.status(500).json({
            message: "Could not delete the resume."
        });
    }
};

// Admin: a short-lived link to one student's resume
const getStudentResume = async (req, res) => {
    try {
        const student = await User.findById(req.params.id);

        if (!student || student.role !== "student") {
            return res.status(404).json({
                message: "Student not found."
            });
        }

        if (!student.resume) {
            return res.status(404).json({
                message: "This student has not uploaded a resume."
            });
        }

        res.status(200).json({
            resume: student.resume,
            url: await resumes.createViewLink(student.resume)
        });

    } catch (error) {
        console.error("Admin Resume Read Error:", error);

        res.status(500).json({
            message: "Could not load the resume."
        });
    }
};

module.exports = {
    getUploadForm,
    saveResume,
    getMyResume,
    deleteMyResume,
    getStudentResume
};
