// --- 1. CONFIGURATION ---
const nodemailer = require("nodemailer"); // On importe la bibliothèque standard pour envoyer des emails avec Node.js

// Cette fonction prépare les "clés" pour ouvrir la porte de ton serveur mail (Gmail ou autre)
function getEmailConfig() {
  const mailerDsn = process.env.MAILER_DSN; // On cherche une adresse de configuration complète (DSN)
  
  if (mailerDsn) {
    // Si MAILER_DSN existe, on utilise une "expression régulière" (Regex) pour découper l'adresse
    // Format : smtp://utilisateur:motdepasse@serveur:port
    const dsnMatch = mailerDsn.match(/^smtp:\/\/([^:]+):([^@]+)@([^:]+):(\d+)/);
    if (dsnMatch) {
      const [, user, pass, host, port] = dsnMatch;
      return {
        host: host,
        port: parseInt(port),
        secure: false, // On utilise false car on utilise souvent le port 587 (TLS)
        requireTLS: true, // Sécurité obligatoire pour protéger le contenu du mail
        auth: {
          user: decodeURIComponent(user), // Nettoyage du nom d'utilisateur
          pass: decodeURIComponent(pass), // Nettoyage du mot de passe
        },
      };
    }
  }
  
  // SOLUTION DE SECOURS (Fallback) : Si MAILER_DSN n'est pas là, on utilise Gmail par défaut
  return {
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, // Ton adresse Gmail (stockée dans le .env)
      pass: process.env.EMAIL_PASS, // Ton mot de passe d'application (stockée dans le .env)
    },
  };
}

// Création du "Transporteur" : C'est le camion qui va livrer tes messages
const transporter = nodemailer.createTransport(getEmailConfig());

// --- 2. FONCTION D'ENVOI DE L'OTP ---
exports.sendOTPEmail = async (email, otpCode) => {
  try {
    // On définit qui envoie le mail (l'adresse de ton projet Lancy)
    let fromEmail = process.env.EMAIL_USER;
    
    // PRÉPARATION DU CONTENU DU MAIL
    const mailOptions = {
      from: fromEmail,      // Expéditeur
      to: email,            // Destinataire (l'utilisateur)
      subject: "Password Reset OTP", // Objet du mail
      // Corps du mail en HTML pour avoir un joli design
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Demande de vérification</h2>
          <p>Utilisez le code OTP suivant pour continuer :</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
            <h1 style="color: #000; font-size: 32px; letter-spacing: 8px; margin: 0;">${otpCode}</h1>
          </div>
          <p style="color: #666;">Ce code expirera dans 10 minutes.</p>
        </div>
      `,
    };

    // ACTION : On envoie réellement le mail
    await transporter.sendMail(mailOptions);
    return true; // Tout s'est bien passé
  } catch (error) {
    // Si l'envoi échoue (mauvais mot de passe, pas d'internet...), on affiche l'erreur
    console.error("Email sending error:", error);
    throw error;
  }
};