
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Generate JWT Token
const generateToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            role: user.role
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
};

const userSummary = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
});

const optionalText = (value) =>
    value === undefined || value === null ? "" : String(value).trim();

const optionalYear = (value) => {
    const year = Number(value);
    return value === undefined || value === "" || !Number.isInteger(year) ? undefined : year;
};

// REGISTER STUDENT
const registerUser = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            phone,
            department,
            enrollmentNumber,
            graduationYear
        } = req.body || {};

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email and password are required."
            });
        }

        if (String(password).length < 6) {
            return res.status(400).json({
                message: "Password must contain at least 6 characters."
            });
        }

        const hashedPassword = await bcrypt.hash(String(password), 10);

        const user = await User.createUser({
            name: String(name).trim(),
            email,
            password: hashedPassword,
            phone: optionalText(phone),
            department: optionalText(department),
            enrollmentNumber: optionalText(enrollmentNumber),
            graduationYear: optionalYear(graduationYear),
            role: "student"
        });

        const token = generateToken(user);

        res.status(201).json({
            message: "Registration successful!",
            token,
            user: userSummary(user)
        });

    } catch (error) {
        if (error instanceof User.DuplicateEmailError) {
            return res.status(409).json({
                message: "An account with this email already exists."
            });
        }

        console.error("Registration Error:", error);

        res.status(500).json({
            message: "Registration failed. Please try again."
        });
    }
};

// LOGIN USER
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required."
            });
        }

        const user = await User.findByEmail(email);

        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const isMatch = await bcrypt.compare(
            String(password),
            user.password
        );

        if (!isMatch) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const token = generateToken(user);

        res.status(200).json({
            message: "Login successful!",
            token,
            user: userSummary(user)
        });

    } catch (error) {
        console.error("Login Error:", error);

        res.status(500).json({
            message: "Login failed. Please try again."
        });
    }
};

// CREATE FIRST ADMIN ACCOUNT
const createAdmin = async (req, res) => {
    try {
        const { name, email, password, setupKey } = req.body || {};

        if (!name || !email || !password || !setupKey) {
            return res.status(400).json({
                message: "All fields are required."
            });
        }

        if (!process.env.ADMIN_SETUP_KEY ||
            setupKey !== process.env.ADMIN_SETUP_KEY) {
            return res.status(403).json({
                message: "Invalid admin setup key."
            });
        }

        if (await User.adminExists()) {
            return res.status(403).json({
                message: "An admin account already exists."
            });
        }

        if (String(password).length < 8) {
            return res.status(400).json({
                message: "Admin password must contain at least 8 characters."
            });
        }

        const hashedPassword = await bcrypt.hash(String(password), 10);

        const admin = await User.createUser({
            name: String(name).trim(),
            email,
            password: hashedPassword,
            role: "admin"
        });

        res.status(201).json({
            message: "Admin account created successfully!",
            admin: userSummary(admin)
        });

    } catch (error) {
        if (error instanceof User.DuplicateEmailError) {
            return res.status(409).json({
                message: "An account with this email already exists."
            });
        }

        console.error("Admin Creation Error:", error);

        res.status(500).json({
            message: "Admin account creation failed."
        });
    }
};

module.exports = {
    registerUser,
    loginUser,
    createAdmin
};
