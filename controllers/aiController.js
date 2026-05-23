const OpenAI = require("openai");
const Project = require("../models/Project");
const Task = require("../models/Task");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const generateTasks = async (req, res) => {
  try {
    const { projectType, projectGoal } = req.body;

    if (!projectType || !projectGoal) {
      return res.status(400).json({
        message: "Project type and project goal are required",
      });
    }

    const prompt = `
You are an expert project manager for a web development agency.

Create a practical task list for this project.

Project Type: ${projectType}
Project Goal: ${projectGoal}

Return ONLY valid JSON in this format:
[
  {
    "title": "Task title",
    "description": "Short task description",
    "priority": "Low | Medium | High"
  }
]

Create 6 to 10 tasks.
Do not include markdown.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.4,
    });

    const aiText = completion.choices[0].message.content;

    const tasks = JSON.parse(aiText);

    res.status(200).json({
      tasks,
    });
  } catch (error) {
    res.status(500).json({
      message: "AI task generation failed",
      error: error.message,
    });
  }
};

const generateProjectSummary = async (req, res) => {
  try {
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({
        message: "Project ID is required",
      });
    }

    const project = await Project.findById(projectId).populate(
      "client",
      "name company email"
    );

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const tasks = await Task.find({
      project: projectId,
    }).sort({ createdAt: -1 });

    const taskSummary = tasks.map((task) => ({
      title: task.title,
      status: task.status,
      priority: task.priority,
      description: task.description,
    }));

    const prompt = `
You are an expert client success manager for a web development agency.

Create a professional project progress update for the client.

Client Name: ${project.client?.name}
Company: ${project.client?.company || "N/A"}
Project Title: ${project.title}
Project Type: ${project.type}
Project Status: ${project.status}
Budget: ${project.budget}
Deadline: ${project.deadline}

Tasks:
${JSON.stringify(taskSummary, null, 2)}

Write the update in a professional but friendly tone.

Return this structure:
1. Project Overview
2. Completed Work
3. Work In Progress
4. Pending Items
5. Risks or Blockers
6. Next Steps
7. Client-Friendly Closing Note

Keep it clear and concise.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.5,
    });

    const summary = completion.choices[0].message.content;

    res.status(200).json({
      summary,
    });
  } catch (error) {
    res.status(500).json({
      message: "AI project summary failed",
      error: error.message,
    });
  }
};

module.exports = {
  generateTasks,
  generateProjectSummary,
};


