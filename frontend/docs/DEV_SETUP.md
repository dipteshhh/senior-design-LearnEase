## LearnEase – Development Setup Guide
This document explains how to set up and run the LearnEase Next.js application locally.

Prerequisites
Before starting, ensure you have the following installed on your machine:

Node.js (LTS version recommended)

Check your version:
node -v
npm (included with Node.js)

Check your version:
npm -v

Installation Steps

1. Clone the Repository
Clone the project from GitHub and navigate into the directory:
git clone https://github.com/dipteshhh/senior-design-LearnEase.git
cd senior-design-LearnEase

2. Install Dependencies
Install the required packages defined in package.json:
npm install

Note: The node_modules/ directory is generated locally and is not committed to GitHub.

Running the Application

Start the Development Server
Once dependencies are installed, start the local server:
npm run dev

Access the App
Open your web browser and navigate to:

http://localhost:3000

You should see the default Next.js landing page if the setup was successful.

Common Issues & Troubleshooting
If the server fails to start or you encounter unexpected errors, try a clean re-install:

Stop the server (Press Ctrl + C in your terminal).

Delete existing dependencies:
rm -rf node_modules package-lock.json

Reinstall dependencies:
npm install

Restart the server:
npm run dev