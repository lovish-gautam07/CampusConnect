
import axios from "axios";

// The backend address comes from VITE_API_URL (see frontend/.env.example).
// After deploying to AWS, set it to the ApiUrl output of the SAM stack.
const API = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api"
});

// Send the saved login token with every request that doesn't set its own.
API.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");

    if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

export default API;
