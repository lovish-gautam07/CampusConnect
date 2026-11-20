
const User = require("../models/User");
const { deleteResumeFile } = require("../storage/resumes");

// GET ALL STUDENTS
const getAllStudents = async (req, res) => {
    try {
        const students = await User.listByRole("student");

        res.status(200).json({
            count: students.length,
            students: students.map(User.toPublic)
        });

    } catch (error) {
        console.error("List Students Error:", error);

        res.status(500).json({
            message: "Failed to fetch students."
        });
    }
};

// DELETE A STUDENT
const deleteStudent = async (req, res) => {
    try {
        const student = await User.deleteStudent(req.params.id);

        if (!student) {
            return res.status(404).json({
                message: "Student not found."
            });
        }

        if (student.resume?.key) {
            await deleteResumeFile(student.resume.key).catch((error) =>
                console.error("Resume Delete Error:", error)
            );
        }

        res.status(200).json({
            message: "Student deleted successfully!"
        });

    } catch (error) {
        console.error("Delete Student Error:", error);

        res.status(500).json({
            message: "Failed to delete student."
        });
    }
};

module.exports = {
    getAllStudents,
    deleteStudent
};
