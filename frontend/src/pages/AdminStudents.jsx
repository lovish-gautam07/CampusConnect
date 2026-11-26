
import { useEffect, useState } from "react";
import { Users, Search, Trash2, ArrowLeft, RefreshCw, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import "./AdminStudents.css";

function AdminStudents() {
    const navigate = useNavigate();

    const [students, setStudents] = useState([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    // Bumped by the Refresh button to load the list again
    const [reloadCount, setReloadCount] = useState(0);

    useEffect(() => {
        let ignore = false;
        const token = localStorage.getItem("token");

        API.get("/admin/students", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })
            .then((response) => {
                if (ignore) return;
                setStudents(response.data.students);
                setError("");
            })
            .catch((err) => {
                if (ignore) return;
                setError(
                    err.response?.data?.message ||
                    "Unable to load students."
                );
            })
            .finally(() => {
                if (!ignore) setLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [reloadCount]);

    const refreshStudents = () => {
        setLoading(true);
        setError("");
        setReloadCount((count) => count + 1);
    };

    const deleteStudent = async (id, name) => {
        const confirmed = window.confirm(
            `Are you sure you want to delete ${name}'s account?`
        );

        if (!confirmed) return;

        try {
            const token = localStorage.getItem("token");

            await API.delete(`/admin/students/${id}`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            setStudents((previous) =>
                previous.filter((student) => student._id !== id)
            );

            alert("Student deleted successfully!");
        } catch (err) {
            alert(
                err.response?.data?.message ||
                "Failed to delete student."
            );
        }
    };

    // Resumes are private in S3; the backend returns a link that expires in 5 minutes
    const viewResume = async (id) => {
        // Open the tab first so the browser doesn't block it as a pop-up
        const tab = window.open("", "_blank");

        try {
            const response = await API.get(`/admin/students/${id}/resume`);

            if (tab) {
                tab.location = response.data.url;
            } else {
                window.location.assign(response.data.url);
            }
        } catch (err) {
            tab?.close();
            alert(
                err.response?.data?.message ||
                "Failed to open the resume."
            );
        }
    };

    const filteredStudents = students.filter((student) => {
        const value = search.toLowerCase();

        return (
            student.name?.toLowerCase().includes(value) ||
            student.email?.toLowerCase().includes(value) ||
            student.department?.toLowerCase().includes(value) ||
            student.enrollmentNumber?.toLowerCase().includes(value)
        );
    });

    return (
        <div className="admin-students-page">

            <header className="students-header">
                <div>
                    <h1><Users size={26} /> Manage Students</h1>
                    <p>View and manage registered student accounts.</p>
                </div>

                <button onClick={() => navigate("/admin-dashboard")}>
                    <ArrowLeft size={17} /> Dashboard
                </button>
            </header>

            <div className="students-summary">
                <div>
                    <span>Total Registered Students</span>
                    <h2>{students.length}</h2>
                </div>

                <Users size={35} />
            </div>

            <div className="students-toolbar">

                <div className="students-search">
                    <Search size={19} />
                    <input
                        type="text"
                        placeholder="Search by name, email, department or UID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <button onClick={refreshStudents}>
                    <RefreshCw size={17} /> Refresh
                </button>

            </div>

            {loading ? (
                <p className="students-message">Loading students...</p>
            ) : error ? (
                <p className="students-error">{error}</p>
            ) : filteredStudents.length === 0 ? (
                <p className="students-message">No students found.</p>
            ) : (

                <div className="students-table-wrapper">
                    <table className="students-table">

                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Email</th>
                                <th>Department</th>
                                <th>Enrollment Number</th>
                                <th>Phone</th>
                                <th>Resume</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>
                            {filteredStudents.map((student) => (
                                <tr key={student._id}>

                                    <td>
                                        <strong>{student.name}</strong>
                                    </td>

                                    <td>{student.email}</td>

                                    <td>{student.department || "Not provided"}</td>

                                    <td>{student.enrollmentNumber || "Not provided"}</td>

                                    <td>{student.phone || "Not provided"}</td>

                                    <td>
                                        {student.resume ? (
                                            <button
                                                className="view-resume-button"
                                                onClick={() => viewResume(student._id)}
                                                title={`Open ${student.resume.fileName}`}
                                            >
                                                <FileText size={16} /> View
                                            </button>
                                        ) : (
                                            "Not uploaded"
                                        )}
                                    </td>

                                    <td>
                                        <button
                                            className="delete-student-button"
                                            onClick={() =>
                                                deleteStudent(student._id, student.name)
                                            }
                                            title="Delete student"
                                        >
                                            <Trash2 size={17} />
                                        </button>
                                    </td>

                                </tr>
                            ))}
                        </tbody>

                    </table>
                </div>

            )}

            <footer className="students-footer">
                Showing {filteredStudents.length} of {students.length} students
            </footer>

        </div>
    );
}

export default AdminStudents;
