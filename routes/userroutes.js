const router = require("express").Router();
const User = require("../models/User");
const Project = require("../models/project");
const bcrypt = require("bcrypt"); // ✅ manquait !
const multer = require("multer"); // ✅ une seule fois
const path = require("path");     // ✅ une seule fois
const fs = require("fs");         // ✅ une seule fois
// Ajoute cette ligne en haut de userroutes.js
const { requireAuth } = require("../middleware/authMiddleware");
// Config multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/avatars";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage });

// --- 1. GET PROFIL ---
router.get("/profile/:email", async (req, res) => {
  try {
    const emailNorm = decodeURIComponent(req.params.email || "")
      .trim()
      .toLowerCase();
    if (!emailNorm) {
      return res.status(400).json({ message: "Email requis" });
    }
    const esc = emailNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const user = await User.findOne({
      email: { $regex: new RegExp("^" + esc + "$", "i") },
    });
    if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });

    let userData = {
      id: user._id,
      name: user.name,
      displayName: user.name || user.email.split("@")[0],
      email: user.email,
      role: user.role,
      avatar: user.avatar || null,
      createdAt: user.createdAt,
    };

    if (user.role === "client") {
      const Project = require("../models/project");
      userData.companyName = user.companyName || "Particulier";
      userData.projectCount = await Project.countDocuments({ clientId: user._id });
    }

    if (user.role === "freelancer") {
      const Proposal = require("../models/proposal");
      userData.speciality = user.speciality || "Freelancer";
      userData.skills = user.skills || [];
      userData.bio = user.bio || "";
      userData.proposalCount = await Proposal.countDocuments({ freelancer: user._id });
      userData.wonCount = await Proposal.countDocuments({
        freelancer: user._id,
        status: "accepted",
      });
    }

    res.status(200).json(userData);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// --- 2. UPDATE PROFIL ---
router.put("/update/:email", async (req, res) => {
  try {
    const updates = req.body;
    const updatedUser = await User.findOneAndUpdate(
      { email: req.params.email },
      { $set: updates },
      { new: true }
    );
    res.status(200).json({
      message: "Profil mis à jour avec succès ✅",
      user: updatedUser,
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur lors de la mise à jour", error: err });
  }
});

// --- 3. ALL FREELANCERS ---
router.get("/all-freelancers", async (req, res) => {
  try {
    const freelancers = await User.find({ role: "freelancer" }).select(
      "name email speciality skills bio avatar"
    );
    res.status(200).json(freelancers);
  } catch (err) {
    res.status(500).json({ message: "Erreur récupération freelancers", error: err });
  }
});

// --- 4. CHANGE PASSWORD ---
router.put("/change-password/:email", async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findOne({ email: req.params.email });

    if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: "Ancien mot de passe incorrect" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Mot de passe modifié ✅" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- 5. UPLOAD AVATAR ---
router.post("/upload-avatar/:email", upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Aucun fichier reçu" });
    }

    const avatarUrl = `${req.protocol}://${req.get("host")}/uploads/avatars/${req.file.filename}`;

    await User.findOneAndUpdate(
      { email: req.params.email },
      { avatar: avatarUrl }
    );

    console.log(`✅ Avatar uploadé : ${avatarUrl}`);
    res.json({ avatarUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.get("/wallet", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("walletBalance role");
    if (!user) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }
    const balance = user.walletBalance ?? 0;
    if (user.role === "freelancer") {
      const projects = await Project.find({
        acceptedFreelancer: req.user._id,
        status: "completed"
      })
        .select("title budget createdAt")
        .sort({ createdAt: -1 });
      return res.json({
        balance,
        currency: "EUR",
        transactions: projects
      });
    }
    res.json({
      balance,
      currency: "EUR",
      transactions: []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;