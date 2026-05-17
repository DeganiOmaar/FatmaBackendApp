// --- IMPORTATION ---
const User = require("../models/User"); // Importation du modèle Mongoose pour interagir avec la collection "users"

// --- FONCTION : RÉCUPÉRER LES INFOS DU PROFIL ---
exports.getProfile = async (req, res) => {
  try {
    // On cherche l'utilisateur dans la base de données via son identifiant (ID)
    // .findById(req.user._id) : utilise l'ID extrait du Token JWT par le middleware d'authentification
    // .select("-password") : EXCLUT le mot de passe des résultats pour plus de sécurité
    const user = await User.findById(req.user._id).select("-password");

    // Si l'ID ne correspond à aucun utilisateur, on renvoie une erreur 404 (Introuvable)
    if (!user) return res.status(404).json({ message: "User not found" });
    
    // On renvoie un objet JSON contenant uniquement les informations nécessaires au Front-end
    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        skills: user.skills,
        bio: user.bio,
      },
    });
  } catch (err) {
    // Bloc de secours en cas de problème technique (ex: coupure BDD)
    return res.status(500).json({ message: "Server error", error: String(err) });
  }
};

// --- FONCTION : MODIFIER LES INFOS DU PROFIL ---
exports.updateProfile = async (req, res) => {
  try {
    // Extraction des données envoyées par l'application Flutter depuis le corps de la requête (body)
    const { name, role, skills, bio } = req.body;
    
    // Validation : On vérifie au minimum que le champ "nom" n'est pas envoyé vide
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    // On récupère l'utilisateur actuel pour pouvoir modifier ses propriétés
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // MISE À JOUR DES DONNÉES :
    user.name = name; // Met à jour le nom
    user.role = role || user.role; // Si un nouveau rôle est fourni, on le change, sinon on garde l'ancien
    user.skills = skills || "";    // Si vide, on enregistre une chaîne de caractères vide
    user.bio = bio || "";          // Idem pour la biographie

    // Sauvegarde les modifications de manière permanente dans MongoDB
    await user.save();

    // Renvoie une réponse de succès (200 OK par défaut) avec les données mises à jour
    return res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        skills: user.skills,
        bio: user.bio,
      },
    });
  } catch (err) {
    // Gestion des erreurs serveurs
    return res.status(500).json({ message: "Server error", error: String(err) });
  }
};

exports.getAllUsers=async(req,res)=>{
  try{
    const users=await User.find().select("-password").sort({createdAt:-1});
    res.status(200).json(users);
  }
  catch(err){
    res.stattus(500).json({message:"Erreur lors la récupération des utilisateurs",error})
  }
};
// Fonction pour supprimer un utilisateur par son ID
exports.deleteUser = async (req, res) => {
    try {
        const userId = req.params.id; // On récupère l'ID envoyé dans l'URL
        const deletedUser = await User.findByIdAndDelete(userId);

        if (!deletedUser) {
            return res.status(404).json({ message: "Utilisateur non trouvé" });
        }

        res.status(200).json({ message: "Utilisateur supprimé avec succès" });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la suppression", error });
    }
};