const express = require('express');
const path = require('path');
const multer = require('multer');
const pdf = require('pdf-parse');
const fs = require('fs');
const natural = require('natural');

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});


const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Not a PDF file!'), false);
        }
    }
});

app.get('/', (req, res) => {
    res.render('index')
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post('/upload', upload.array('pdf', 100), async (req, res) => {
    const jobDescription = req.body.jobDescription;

    if (req.files && req.files.length > 0) {
        try {
            const rankedResumes = await handleResumeUpload(req.files, jobDescription);
            return res.json(rankedResumes);
        } catch (error) {
            console.error("Error processing resumes: ", error);
            return res.status(500).json({ error: 'Error processing resumes.' });
        }
    } else {
        return res.status(400).json({ error: 'No PDF files uploaded.' });
    }
});


const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
}

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

function tokenize(text) {
    const tokenizer = new natural.WordTokenizer();
    return tokenizer.tokenize(text.toLowerCase());
}

function scoreResumeWithAI(resume, jobDescriptionTokens) {
    const resumeTokens = tokenize(resume);

    const resumeSet = new Set(resumeTokens);
    const jobDescriptionSet = new Set(jobDescriptionTokens);
    let score = 0;
    jobDescriptionSet.forEach(token => {
        if (resumeSet.has(token)) {
            score++;
        }
    });

    return score;
}

async function handleResumeUpload(files, jobDescription) {
    let resumeTexts = [];
    let filenames = [];
    
    for (let file of files) {
        const resumeText = await extractTextFromPDF(file);
        resumeTexts.push(resumeText);
        filenames.push(file.filename);
    }

    const rankedResumes = rankResumesWithAI(resumeTexts, jobDescription, filenames);
    
    const returnThis = [];
    rankedResumes.forEach(({ resume, score, filename }, index) => {
        console.log(`${index + 1}: ${filename} (Score: ${score})`);
        returnThis.push({
            filename: filename,
            score: score
        });
    });

    return returnThis;
}

async function extractTextFromPDF(file) {
    const filePath = path.join(__dirname, 'uploads', file.filename);
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
}

function tokenize(text) {
    const tokenizer = new natural.WordTokenizer();
    return tokenizer.tokenize(text.toLowerCase());
}

function scoreResumeWithAI(resume, jobDescriptionTokens) {
    const resumeTokens = tokenize(resume);
    const resumeSet = new Set(resumeTokens);
    const jobDescriptionSet = new Set(jobDescriptionTokens);

    let score = 0;
    jobDescriptionSet.forEach(token => {
        if (resumeSet.has(token)) {
            score++;
        }
    });
    return score;
}

function rankResumesWithAI(resumes, jobDescription, filenames) {
    const jobDescriptionTokens = tokenize(jobDescription);
    const scoredResumes = resumes.map((resume, index) => ({
        resume,
        score: scoreResumeWithAI(resume, jobDescriptionTokens),
        filename: filenames[index]
    }));

    return scoredResumes.sort((a, b) => b.score - a.score);
}