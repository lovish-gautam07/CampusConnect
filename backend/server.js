
// Runs the API on your computer: npm run dev
require("dotenv").config();

const app = require("./app");

if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, (error) => {
    if (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }

    console.log(`CampusConnect Server running on port ${PORT}`);
});
