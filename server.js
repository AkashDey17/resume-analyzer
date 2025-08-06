const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = 3000;
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));
app.use(express.json()); // for parsing application/json

// Analyze resume + optional job description
app.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    let resumeText = "";

    // Parse resume file text
    if (req.file.mimetype === "application/pdf") {
      const buffer = fs.readFileSync(req.file.path);
      const data = await pdfParse(buffer);
      resumeText = data.text;
    } else {
      resumeText = fs.readFileSync(req.file.path, "utf8");
    }

    fs.unlinkSync(req.file.path); // Clean up uploaded file

    const jobDesc = req.body.jobDescription?.trim();

    let prompt = `
You are an expert resume reviewer and career AI advisor.

Analyze the following resume text and provide detailed feedback in this format:

1. ✅ Summary of Candidate
2. ⭐ Key Strengths
3. ⚠️ Weaknesses & Suggestions
4. ✍️ Font & Formatting Tips (professionalism, ATS compatibility)
5. 🧠 Technologies/Skills to Learn (based on current skills)
6. 💼 Ideal Job Roles (e.g., Frontend Dev, Data Analyst, etc.)
7. 📊 ATS Compatibility Score (0–10):
   - Include how readable, keyword-optimized, and machine-parsable it is.
   - Be strict. Give 5 or below if it's poorly formatted or lacks keywords.
8. 🌟 Resume Quality Score (0–10):
   - Consider professionalism, clarity, structure, and content.
9. 📌 Missing Certifications or Keywords
`;

    if (jobDesc) {
      prompt += `

Additionally, compare the resume against this job description:

"""${jobDesc}"""

Provide feedback on how well the resume matches this job description, including:
- Missing keywords/skills from job description
- Tailored ATS score for this job
- Suggestions to better match the job requirements
`;
    }

    prompt += `

Resume:
"""${resumeText}"""
`;

    const openrouterRes = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: "openai/gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = openrouterRes.data.choices[0].message.content;

    // Return analysis AND resumeText for chat use
    res.json({ analysis: reply, resumeText });

  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ analysis: "❌ Error analyzing resume." });
  }
});

// New chat endpoint for Q&A based on uploaded resume
app.post('/chat', async (req, res) => {
  try {
    const { question, resumeText } = req.body;
    if (!question || !resumeText) {
      return res.status(400).json({ error: 'Question and resumeText are required' });
    }

    const prompt = `
You are an AI career assistant. Using this resume text, answer the user's question clearly and helpfully.

Resume Text:
"""${resumeText}"""

User Question:
"""${question}"""

Answer:
`;

    const openrouterRes = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: "openai/gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const answer = openrouterRes.data.choices[0].message.content;
    res.json({ answer });

  } catch (err) {
    console.error("❌ Chat error:", err.message);
    res.status(500).json({ answer: "❌ Error processing your question." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Resume Analyzer running at http://localhost:${PORT}`);
});
