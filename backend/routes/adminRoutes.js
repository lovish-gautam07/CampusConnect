
const express = require("express");
const router = express.Router();

const {
    getAllStudents,
    deleteStudent
} = require("../controllers/adminController");

const { getStudentResume } = require("../controllers/resumeController");

const { protect, authorize } = require("../middleware/authMiddleware");

// Only administrators can access these routes
router.get("/students", protect, authorize("admin"), getAllStudents);

router.delete("/students/:id", protect, authorize("admin"), deleteStudent);

router.get("/students/:id/resume", protect, authorize("admin"), getStudentResume);

module.exports = router;
