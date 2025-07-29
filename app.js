const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Admin password (in production, use environment variables)
const ADMIN_PASSWORD = 'withFLOW25!';

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true, parameterLimit: 50000 }));
app.use(session({
  secret: 'flowchart-admin-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));
app.use(express.static('public'));
app.use('/flowcharts', express.static('flowcharts'));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per file
    fieldSize: 100 * 1024 * 1024,
    fields: 1000,
    files: 10
  }
});

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
}

// Login route
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Logout route
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Check authentication status
app.get('/api/auth-status', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

// Ensure flowcharts directory exists
async function ensureFlowchartsDir() {
  try {
    await fs.access('flowcharts');
  } catch {
    await fs.mkdir('flowcharts');
  }
}

// Get all flowcharts
app.get('/api/flowcharts', requireAuth, async (req, res) => {
  try {
    const flowchartsDir = await fs.readdir('flowcharts');
    const flowcharts = [];

    for (const dir of flowchartsDir) {
      try {
        const setupPath = path.join('flowcharts', dir, 'setup.json');
        const setupData = await fs.readFile(setupPath, 'utf8');
        const setup = JSON.parse(setupData);
        
        // Get directory stats for creation time
        const dirPath = path.join('flowcharts', dir);
        const stats = await fs.stat(dirPath);
        
        flowcharts.push({
          id: dir,
          title: setup.title,
          subtitle: setup.subtitle,
          url: `/flowcharts/${dir}`,
          createdAt: stats.mtime
        });
      } catch (error) {
        console.error(`Error reading flowchart ${dir}:`, error);
      }
    }

    // Sort by creation time, most recent first
    flowcharts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(flowcharts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list flowcharts' });
  }
});

// Create new flowchart
app.post('/api/flowcharts', requireAuth, upload.fields([
  { name: 'flowchart', maxCount: 1 },
  { name: 'narration', maxCount: 1 },
  { name: 'timestamps', maxCount: 1 }
]), async (req, res) => {
  try {
    // Get custom ID from form, handle both direct access and potential multer parsing issues
    const customId = req.body.flowchartId || req.body['flowchartId'] || '';
    const id = customId.trim() || uuidv4();

    console.log(`Creating flowchart with ID: ${id} ${customId.trim() ? '(custom)' : '(auto-generated)'}`);
    const flowchartDir = path.join('flowcharts', id);

    // Create flowchart directory
    await fs.mkdir(flowchartDir, { recursive: true });

    // Copy all files from src directory to flowchart directory
    await copyDirectory('src', path.join(flowchartDir, 'src'));

    // Copy main files
    await fs.copyFile('index.html', path.join(flowchartDir, 'index.html'));
    await fs.copyFile('vite.config.js', path.join(flowchartDir, 'vite.config.js'));
    await fs.copyFile('vue-package.json', path.join(flowchartDir, 'package.json'));

    // Create public directory in flowchart
    const publicDir = path.join(flowchartDir, 'public');
    await fs.mkdir(publicDir);

    // Save uploaded files
    if (req.files.flowchart) {
      await fs.writeFile(path.join(publicDir, 'flowchart.svg'), req.files.flowchart[0].buffer);
    }

    if (req.files.narration) {
      await fs.writeFile(path.join(publicDir, 'narration.mp3'), req.files.narration[0].buffer);
    }

    if (req.files.timestamps) {
      await fs.writeFile(path.join(publicDir, 'timestamps.txt'), req.files.timestamps[0].buffer);
    }

    // Create setup.json in both public (for build) and root (for API access)
    const setup = {
      id: id,
      title: req.body.title,
      subtitle: req.body.subtitle,
      colors: {
        'background-color': req.body.backgroundColor,
        'intro-background-color': req.body.introBackgroundColor,
        'text-color': req.body.textColor,
        'accent-color': req.body.accentColor
      }
    };

    await fs.writeFile(path.join(publicDir, 'setup.json'), JSON.stringify(setup, null, 2));
    await fs.writeFile(path.join(flowchartDir, 'setup.json'), JSON.stringify(setup, null, 2));

    // Create intro.md in both locations
    await fs.writeFile(path.join(publicDir, 'intro.md'), req.body.intro || '');
    await fs.writeFile(path.join(flowchartDir, 'intro.md'), req.body.intro || '');

    // Build the flowchart
    const { spawn } = require('child_process');

    const buildProcess = spawn('npm', ['run', 'build'], {
      cwd: flowchartDir,
      stdio: 'pipe'
    });

    buildProcess.on('close', async (code) => {
      if (code === 0) {
        // Move dist contents to root and clean up
        try {
          const distDir = path.join(flowchartDir, 'dist');
          const files = await fs.readdir(distDir);

          for (const file of files) {
            await fs.rename(
              path.join(distDir, file),
              path.join(flowchartDir, file)
            );
          }

          // Clean up build files
          await fs.rmdir(distDir);
          await fs.rm(path.join(flowchartDir, 'src'), { recursive: true });
          await fs.rm(path.join(flowchartDir, 'public'), { recursive: true });
          await fs.unlink(path.join(flowchartDir, 'vite.config.js'));
          await fs.unlink(path.join(flowchartDir, 'package.json'));

          // Ensure setup.json and intro.md are preserved in root for API access
          if (!await fs.access(path.join(flowchartDir, 'setup.json')).then(() => true).catch(() => false)) {
            await fs.writeFile(path.join(flowchartDir, 'setup.json'), JSON.stringify(setup, null, 2));
          }
          if (!await fs.access(path.join(flowchartDir, 'intro.md')).then(() => true).catch(() => false)) {
            await fs.writeFile(path.join(flowchartDir, 'intro.md'), req.body.intro || '');
          }

        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      }
    });

    res.json({ id, url: `/flowcharts/${id}` });
  } catch (error) {
    console.error('Error creating flowchart:', error);
    res.status(500).json({ error: 'Failed to create flowchart' });
  }
});

// Delete flowchart
app.delete('/api/flowcharts/:id', requireAuth, async (req, res) => {
  try {
    const flowchartDir = path.join('flowcharts', req.params.id);
    await fs.rm(flowchartDir, { recursive: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete flowchart' });
  }
});

// Get flowchart data for editing
app.get('/api/flowcharts/:id/data', requireAuth, async (req, res) => {
  try {
    const flowchartDir = path.join('flowcharts', req.params.id);
    const setupData = await fs.readFile(path.join(flowchartDir, 'setup.json'), 'utf8');
    const setup = JSON.parse(setupData);

    let intro = '';
    try {
      intro = await fs.readFile(path.join(flowchartDir, 'intro.md'), 'utf8');
    } catch {}

    res.json({
      ...setup,
      intro,
      backgroundColor: setup.colors['background-color'],
      introBackgroundColor: setup.colors['intro-background-color'],
      textColor: setup.colors['text-color'],
      accentColor: setup.colors['accent-color']
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get flowchart data' });
  }
});

// Helper function to copy directory recursively
async function copyDirectory(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// Serve admin interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

ensureFlowchartsDir().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
});