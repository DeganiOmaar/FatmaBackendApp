const User = require("../models/user");
const Project = require("../models/project");

exports.buildStats = async () => {

  const users = await User.find();
  const projects = await Project.find();

  return {
    users: {
      clients: users.filter(u => u.role === "client").length,
      freelancers: users.filter(u => u.role === "freelancer").length
    },

    projects: {
      open: projects.filter(p => p.status === "open").length,
      inProgress: projects.filter(p => p.status === "in_progress").length,
      completed: projects.filter(p => p.status === "completed").length
    }
  };
};