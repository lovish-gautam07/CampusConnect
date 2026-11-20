import { useEffect, useRef, useState } from "react";
import { FileText, Upload, Trash2, ExternalLink } from "lucide-react";
import API from "../api";
import "./ResumeCard.css";

const MAX_BYTES = 5 * 1024 * 1024;

const formatSize = (bytes) =>
    bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const errorMessage = (err, fallback) =>
    err.response?.data?.message || err.message || fallback;

// Lets a student upload, view, replace and delete their resume.
// The PDF goes straight from the browser to Amazon S3 using a signed form
// from the backend, then the backend checks it and saves it on the profile.
function ResumeCard() {
    const cardRef = useRef(null);
    const inputRef = useRef(null);

    const [resume, setResume] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    useEffect(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

        API.get("/students/me/resume")
            .then((response) => setResume(response.data.resume))
            .catch((err) => setError(errorMessage(err, "Could not load your resume.")))
            .finally(() => setLoading(false));
    }, []);

    const upload = async (file) => {
        setError("");
        setNotice("");

        if (file.type !== "application/pdf") {
            setError("Please choose a PDF file.");
            return;
        }

        if (file.size > MAX_BYTES) {
            setError("The resume must be 5 MB or less.");
            return;
        }

        setBusy(true);

        try {
            const { data: form } = await API.post("/students/me/resume/upload-url", {
                fileSize: file.size
            });

            const body = new FormData();
            Object.entries(form.fields).forEach(([name, value]) => body.append(name, value));
            body.append("file", file);

            const s3Response = await fetch(form.url, { method: "POST", body });

            if (!s3Response.ok) {
                throw new Error("Upload to storage failed. Please try again.");
            }

            const { data } = await API.post("/students/me/resume", {
                key: form.key,
                fileName: file.name
            });

            setResume(data.resume);
            setNotice("Resume uploaded.");
        } catch (err) {
            setError(errorMessage(err, "Upload failed. Please try again."));
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const view = async () => {
        // Open the tab first so the browser doesn't block it as a pop-up
        const tab = window.open("", "_blank");
        setError("");

        try {
            const { data } = await API.get("/students/me/resume");

            if (tab) {
                tab.location = data.url;
            } else {
                window.location.assign(data.url);
            }
        } catch (err) {
            tab?.close();
            setError(errorMessage(err, "Could not open your resume."));
        }
    };

    const remove = async () => {
        if (!window.confirm("Delete your resume?")) return;

        setBusy(true);
        setError("");
        setNotice("");

        try {
            await API.delete("/students/me/resume");
            setResume(null);
            setNotice("Resume deleted.");
        } catch (err) {
            setError(errorMessage(err, "Could not delete your resume."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="dashboard-panel resume-card" ref={cardRef}>
            <h2>My Resume</h2>
            <p className="resume-hint">
                Upload your resume as a PDF (5 MB or less). Placement admins can view it.
            </p>

            {loading ? (
                <p className="resume-hint">Loading...</p>
            ) : resume ? (
                <div className="resume-file">
                    <FileText size={22} />
                    <div>
                        <strong>{resume.fileName}</strong>
                        <small>
                            {formatSize(resume.size)} · uploaded{" "}
                            {new Date(resume.uploadedAt).toLocaleDateString()}
                        </small>
                    </div>
                    <button onClick={view} disabled={busy} title="View resume">
                        <ExternalLink size={16} /> View
                    </button>
                    <button
                        className="resume-delete"
                        onClick={remove}
                        disabled={busy}
                        title="Delete resume"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            ) : (
                <p className="resume-hint">You haven't uploaded a resume yet.</p>
            )}

            <label className={`resume-upload ${busy ? "disabled" : ""}`}>
                <Upload size={16} />
                {busy ? "Working..." : resume ? "Replace resume" : "Upload resume"}
                <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf"
                    disabled={busy || loading}
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) upload(file);
                    }}
                />
            </label>

            {error && <p className="resume-error" role="alert">{error}</p>}
            {notice && <p className="resume-notice" role="status">{notice}</p>}
        </div>
    );
}

export default ResumeCard;
