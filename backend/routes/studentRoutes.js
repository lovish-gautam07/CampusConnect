
const express = require("express");
const router = express.Router();

const {
    getUploadForm,
    saveResume,
    getMyResume,
    deleteMyResume
} = require("../controllers/resumeController");

const { protect, authorize } = require("../middleware/authMiddleware");

// Only the logged-in student can manage their own resume
router.use(protect, authorize("student"));

router.post("/me/resume/upload-url", getUploadForm);
router.post("/me/resume", saveResume);
router.get("/me/resume", getMyResume);
router.delete("/me/resume", deleteMyResume);

module.exports = router;
