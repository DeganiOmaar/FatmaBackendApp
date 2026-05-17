//Connecter ton application à MongoDB.

const mongoose = require("mongoose");// On importe mongoose (outil pour parler avec MongoDB)

const connectDB = async () =>  //pour se connecter
    
{
  try {
    await mongoose.connect(process.env.MONGO_URI);//vient du fichier .env
    console.log("MongoDB Connected ✅");// affichage de message 
  } catch (error) {
    console.error("DB Error:", error); //affichage d'erreur 
    process.exit(1);//arrét du connexion en cas d'errur 
     
  }
};

module.exports = connectDB;