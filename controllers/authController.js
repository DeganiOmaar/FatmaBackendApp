const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const OTP = require("../models/OTP");
const emailService = require("../services/emailServices");

// --- UTILITAIRES ---

// Fonction pour créer le Token JWT
function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

// Générateur d'OTP (6 chiffres)
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

async function findUserByEmailLoose(emailNorm) {
  let user = await User.findOne({ email: emailNorm });
  if (user || !emailNorm) return user;
  const esc = emailNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return User.findOne({ email: { $regex: new RegExp("^" + esc + "$", "i") } });
}

// --- SESSION / PROFIL (token valide) ---
exports.profile = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Non authentifié" });
    }
    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur" });
  }
};

// --- LOGIQUE D'AUTHENTIFICATION ---

// 1. INSCRIPTION (REGISTER)
exports.register = async (req, res) => {
  try {
    const { name, password, role, skills, bio, speciality, hourlyRate } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Champs obligatoires manquants" });
    }

    const existingUser = await findUserByEmailLoose(email);
    if (existingUser) {
      return res.status(400).json({ message: "Cet email est déjà utilisé" });
    }

    let skillArray = [];
    if (role === "freelancer") {
      const raw = Array.isArray(skills) ? skills : [];
      skillArray = [
        ...new Set(raw.map((s) => String(s || "").trim()).filter(Boolean)),
      ].slice(0, 7);
      if (skillArray.length === 0) {
        return res.status(400).json({
          message: "Le freelancer doit indiquer entre 1 et 7 compétences",
        });
      }
    }

    let hourlyNum = undefined;
    if (hourlyRate !== undefined && hourlyRate !== null && hourlyRate !== "") {
      const n = Number(hourlyRate);
      if (Number.isFinite(n) && n >= 0) hourlyNum = n;
    }

    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message:
          "Le mot de passe doit contenir au moins 8 caractères, incluant des lettres, des chiffres et des symboles.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      skills: role === "freelancer" ? skillArray : [],
      bio: role === "freelancer" ? bio : undefined,
      speciality: role === "freelancer" ? String(speciality || "").trim() : undefined,
      hourlyRate: role === "freelancer" && hourlyNum !== undefined ? hourlyNum : undefined,
      isVerified: false,
    });

    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await OTP.create({ email, code: otpCode, expiresAt, verified: false });
    await emailService.sendOTPEmail(email, otpCode);

    return res.status(201).json({
      message: "Utilisateur créé. Vérifiez votre email pour le code OTP ✨",
      email,
    });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};

// 2. CONNEXION (LOGIN)
exports.login = async (req, res) => {
  try {
    const { password } = req.body;
    const email = normalizeEmail(req.body.email);
    const user = await findUserByEmailLoose(email);

    if (!user) return res.status(401).json({ message: "Identifiants invalides" });

    // Bloquer la connexion si l'email n'est pas vérifié
    if (!user.isVerified) {
      return res.status(403).json({ message: "Veuillez vérifier votre compte par email" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Identifiants invalides" });

    const token = signToken(user._id);
    return res.json({
      message: "Connexion réussie",
      token,
      user: {
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role
}
    });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur", error: String(err) });
  }
};

// 3. VÉRIFICATION OTP (VERIFY OTP)
exports.verifyOTP = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || "");
    const isRegister =
      req.body.isFromRegister === true || req.body.isFromRegister === "true";

    const otpRecord = await OTP.findOne({
      email,
      code,
      verified: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      return res.status(400).json({ message: "Code invalide ou expiré" });
    }

    if (isRegister) {
      await OTP.deleteOne({ _id: otpRecord._id });
      const user = await User.findOneAndUpdate(
        { email },
        { isVerified: true },
        { new: true }
      );

      if (!user) {
        return res.status(400).json({ message: "Utilisateur introuvable" });
      }

      const token = signToken(user._id);
      return res.json({
        message: "Compte activé avec succès ! 🎉",
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    }

    // Mot de passe oublié : garder l’OTP (verified: true) pour l’étape reset-password
    otpRecord.verified = true;
    await otpRecord.save();
    return res.json({ message: "Code vérifié avec succès" });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur" });
  }
};

// 4. MOT DE PASSE OUBLIÉ (FORGOT PASSWORD)
exports.forgotPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) return res.status(400).json({ message: "Email requis" });

    const user = await findUserByEmailLoose(email);
    if (!user) {
      return res.json({ message: "Si l'email existe, un code a été envoyé" });
    }

    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await OTP.deleteMany({ email });
    await OTP.create({
      email,
      code: otpCode,
      expiresAt,
      verified: false,
    });

    await emailService.sendOTPEmail(email, otpCode);
    return res.json({ message: "Code OTP envoyé par email" });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur", error: String(err) });
  }
};

// 5. RÉINITIALISATION (RESET PASSWORD)
exports.resetPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { code, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Les mots de passe ne correspondent pas" });
    }

    const otpRecord = await OTP.findOne({
      email,
      code: String(code || ""),
      verified: true,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      return res.status(400).json({ message: "Session expirée ou code non vérifié" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findOneAndUpdate({ email }, { password: hashedPassword });

    await OTP.deleteOne({ _id: otpRecord._id });

    return res.json({ message: "Mot de passe réinitialisé avec succès ! ✅" });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur" });
  }
 
};
// Ajoute ceci à la fin de ton fichier authController.js
exports.adminLogin = async (req, res) => {
  try {
    const emailRecu = normalizeEmail(req.body.email);
    const passRecu = req.body.password;

    const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || "fatmahssini3@gmail.com");
    const ADMIN_PASS = process.env.ADMIN_PASSWORD || "123456";

    console.log(`Tentative Login Admin: [${emailRecu}]`);

    if (emailRecu !== ADMIN_EMAIL || passRecu !== ADMIN_PASS) {
      return res.status(401).json({ message: "Identifiants Admin incorrects" });
    }

    let adminUser = await findUserByEmailLoose(ADMIN_EMAIL);
    if (!adminUser) {
      const hashedPassword = await bcrypt.hash(ADMIN_PASS, 10);
      adminUser = await User.create({
        name: "Administrateur",
        email: ADMIN_EMAIL,
        password: hashedPassword,
        role: "admin",
        isVerified: true,
      });
    } else if (adminUser.role !== "admin") {
      adminUser.role = "admin";
      adminUser.isVerified = true;
      await adminUser.save();
    }

    const token = signToken(adminUser._id);
    return res.json({
      message: "Connexion réussie",
      token,
      user: {
        _id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
      },
    });
  } catch (err) {
    console.error("Erreur AdminLogin:", err);
    return res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};