import express from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import cors from "cors"
import session from "express-session"
import passport from "passport"
import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import pkg from "@prisma/client"

const { PrismaClient } = pkg
const prisma = new PrismaClient()

const app = express()

app.use(express.json())
app.use(cors())

// 🔑 JWT Secret
const JWT_SECRET = "supersecretkey"

// 🔑 Google Keys (PASTE YOURS HERE)
process.env.GOOGLE_CLIENT_ID
process.env.GOOGLE_CLIENT_SECRET
// 🔐 Session setup
app.set("trust proxy", 1)


app.use(session({
  secret: "secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,       // HTTPS required
    httpOnly: true,
    sameSite: "none"    // IMPORTANT for cross-site
  }
}))

app.use(passport.initialize())
app.use(passport.session())

// 🔐 Google Strategy
passport.use(new GoogleStrategy({
  clientID: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  callbackURL: "https://hirenextai.com/auth/google/callback"
},
async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails[0].value

    let user = await prisma.users.findUnique({
      where: { email }
    })

    if (!user) {
      user = await prisma.users.create({
        data: {
          name: profile.displayName,
          email,
          role: "job_seeker"
        }
      })
    }

    return done(null, user)
  } catch (err) {
    return done(err, null)
  }
}))

// 🔁 Serialize
passport.serializeUser((user, done) => done(null, user.id))

passport.deserializeUser(async (id, done) => {
  const user = await prisma.users.findUnique({ where: { id } })
  done(null, user)
})

// 🔐 REGISTER
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body

    const existingUser = await prisma.users.findUnique({
      where: { email }
    })

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.users.create({
      data: {
        name,
        email,
        password_hash: hashedPassword,
        role: "job_seeker"
      }
    })

    res.json({ message: "User created", user })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Server error" })
  }
})

// 🔑 LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await prisma.users.findUnique({
      where: { email }
    })

    if (!user) {
      return res.status(400).json({ message: "User not found" })
    }

    const isMatch = await bcrypt.compare(password, user.password_hash)

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" })
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    )

    res.json({ message: "Login successful", token, user })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Server error" })
  }
})

// 🌐 Google Login Route
app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
)

// 🌐 Google Callback
app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    const token = jwt.sign(
      { userId: req.user.id, email: req.user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    )

    // 🔥 redirect to YOUR REAL WEBSITE
    res.redirect(`https://hirenextai.com/dashboard?token=${token}`)
  }
)

// 🚀 Start server
const PORT = 3001

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})


app.post("/api/auth/google-success", (req, res) => {
  const { token } = req.body
  req.session.token = token
  res.json({ success: true })
})
