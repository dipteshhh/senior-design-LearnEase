'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface TransformedContent {
  simple: string;
  stepByStep: string;
  bulletPoints: string;
}

export default function Results() {
  const [originalText, setOriginalText] = useState('');
  const [transformedContent, setTransformedContent] = useState<TransformedContent | null>(null);
  const [activeTab, setActiveTab] = useState<'simple' | 'stepByStep' | 'bulletPoints' | 'audio'>('simple');
  const [isLoading, setIsLoading] = useState(true);
  const [isTransforming, setIsTransforming] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speechSynthesis, setSpeechSynthesis] = useState<SpeechSynthesis | null>(null);
  const [currentUtterance, setCurrentUtterance] = useState<SpeechSynthesisUtterance | null>(null);
  const router = useRouter();

  useEffect(() => {
    const extractedText = localStorage.getItem('extractedText');
    if (extractedText) {
      setOriginalText(extractedText);
      transformContent(extractedText);
    } else {
      router.push('/');
    }

    // Initialize speech synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setSpeechSynthesis(window.speechSynthesis);
    }

    setIsLoading(false);
  }, [router]);

  const transformContent = async (text: string) => {
    setIsTransforming(true);
    
    // Simulate AI transformation (in real implementation, this would call OpenAI API)
    // For MVP, we'll use rule-based transformations
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API delay

    const isAssignment = text.toLowerCase().includes('assignment') || 
                        text.toLowerCase().includes('homework') || 
                        text.toLowerCase().includes('solve') ||
                        text.toLowerCase().includes('answer');

    const simple = generateSimpleExplanation(text, isAssignment);
    const stepByStep = generateStepByStep(text, isAssignment);
    const bulletPoints = generateBulletPoints(text, isAssignment);

    setTransformedContent({
      simple,
      stepByStep,
      bulletPoints
    });
    
    setIsTransforming(false);
  };

  const generateSimpleExplanation = (text: string, isAssignment: boolean): string => {
    if (isAssignment) {
      return `📚 Learning Guide

This appears to be assignment content. Instead of providing direct answers, here's how to approach this material:

🎯 Key Concepts to Understand:
The main topics in this content relate to the core principles and concepts that you need to grasp. Focus on understanding the underlying theory and methodology.

💡 Learning Approach:
1. Break down complex terms into simpler definitions
2. Look for patterns and relationships between concepts
3. Practice with similar examples (not the exact assignment)
4. Connect new information to what you already know

🔍 Study Strategy:
Review the fundamental principles, practice with related problems, and ensure you understand the "why" behind each concept rather than just memorizing steps.

Remember: The goal is understanding, not just getting the right answer!`;
    }

    // For non-assignment content, provide simplified explanation
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const keyPoints = sentences.slice(0, 3).map(s => s.trim());
    
    return `📖 Simplified Explanation

${keyPoints.map(point => `• ${point.length > 100 ? point.substring(0, 100) + '...' : point}`).join('\n\n')}

🔑 Main Takeaway:
This content focuses on helping you understand the core concepts in an accessible way. The key is to break down complex ideas into manageable pieces that build upon each other.`;
  };

  const generateStepByStep = (text: string, isAssignment: boolean): string => {
    if (isAssignment) {
      return `📋 Step-by-Step Learning Guide

🚫 Note: This appears to be assignment content. I'll provide a learning structure, not direct answers.

Step 1: Identify Key Concepts
→ Read through the material and highlight unfamiliar terms
→ List the main topics or themes
→ Note any formulas, processes, or methodologies mentioned

Step 2: Research Fundamentals
→ Look up definitions for key terms
→ Find additional resources that explain the core concepts
→ Review related examples (not from your assignment)

Step 3: Break Down the Problem
→ Identify what type of problem or question this is
→ Determine what knowledge areas are being tested
→ Consider what approach or methodology applies

Step 4: Practice and Apply
→ Work through similar practice problems
→ Apply the concepts to different scenarios
→ Test your understanding with self-assessment

Step 5: Synthesize and Review
→ Summarize what you've learned in your own words
→ Connect new concepts to previous knowledge
→ Prepare to explain the concepts to someone else`;
    }

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const steps = sentences.slice(0, 5);
    
    return `📋 Step-by-Step Breakdown

${steps.map((step, index) => 
  `Step ${index + 1}: ${step.trim().length > 80 ? step.trim().substring(0, 80) + '...' : step.trim()}`
).join('\n\n')}

🎯 Next Steps:
Review each step carefully and ensure you understand how they connect to form the complete picture.`;
  };

  const generateBulletPoints = (text: string, isAssignment: boolean): string => {
    if (isAssignment) {
      return `📌 Key Learning Points

🎯 Assignment Approach:
• This content appears to be assignment-related
• Focus on understanding concepts, not finding direct answers
• Use this as a learning opportunity to build knowledge

📚 Study Focus Areas:
• Identify the main subject areas covered
• Break down complex terminology into simpler parts
• Look for patterns and relationships between ideas
• Connect to previously learned material

💡 Learning Strategies:
• Research background concepts independently
• Practice with similar (non-assignment) examples
• Explain concepts in your own words
• Seek help understanding principles, not answers

🔍 Self-Assessment:
• Can you explain the key concepts without looking?
• Do you understand the underlying principles?
• Can you apply these concepts to new situations?
• Are you prepared to discuss this material in class?`;
    }

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const points = sentences.slice(0, 6);
    
    return `📌 Key Points Summary

${points.map(point => 
  `• ${point.trim().length > 60 ? point.trim().substring(0, 60) + '...' : point.trim()}`
).join('\n\n')}

🎯 Remember:
These points capture the essential information in an easy-to-review format.`;
  };

  const handlePlayAudio = (content: string) => {
    if (!speechSynthesis) {
      alert('Speech synthesis is not supported in your browser.');
      return;
    }

    if (isPlaying && currentUtterance) {
      speechSynthesis.cancel();
      setIsPlaying(false);
      setCurrentUtterance(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(content);
    utterance.rate = 0.8;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => {
      setIsPlaying(false);
      setCurrentUtterance(null);
    };
    utterance.onerror = () => {
      setIsPlaying(false);
      setCurrentUtterance(null);
    };

    setCurrentUtterance(utterance);
    speechSynthesis.speak(utterance);
  };

  const getCurrentContent = () => {
    if (!transformedContent) return '';
    
    switch (activeTab) {
      case 'simple':
        return transformedContent.simple;
      case 'stepByStep':
        return transformedContent.stepByStep;
      case 'bulletPoints':
        return transformedContent.bulletPoints;
      case 'audio':
        return transformedContent.simple; // Use simple explanation for audio
      default:
        return transformedContent.simple;
    }
  };

  const handleNewContent = () => {
    localStorage.removeItem('extractedText');
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Transformed Content
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Your content in multiple accessible formats
          </p>
        </div>

        {/* Loading State */}
        {isTransforming && (
          <div className="max-w-4xl mx-auto mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Transforming Your Content
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Creating accessible formats for better learning...
              </p>
            </div>
          </div>
        )}

        {/* Results */}
        {transformedContent && (
          <div className="max-w-4xl mx-auto">
            {/* Tab Navigation */}
            <div className="bg-white dark:bg-gray-800 rounded-t-lg shadow-lg">
              <div className="flex border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setActiveTab('simple')}
                  className={`px-6 py-3 text-sm font-medium rounded-tl-lg ${
                    activeTab === 'simple'
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-b-2 border-blue-500'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  📖 Simple
                </button>
                <button
                  onClick={() => setActiveTab('stepByStep')}
                  className={`px-6 py-3 text-sm font-medium ${
                    activeTab === 'stepByStep'
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-b-2 border-blue-500'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  📋 Step-by-Step
                </button>
                <button
                  onClick={() => setActiveTab('bulletPoints')}
                  className={`px-6 py-3 text-sm font-medium ${
                    activeTab === 'bulletPoints'
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-b-2 border-blue-500'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  📌 Bullet Points
                </button>
                <button
                  onClick={() => setActiveTab('audio')}
                  className={`px-6 py-3 text-sm font-medium ${
                    activeTab === 'audio'
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-b-2 border-blue-500'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  🔊 Audio
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="bg-white dark:bg-gray-800 rounded-b-lg shadow-lg p-6">
              {activeTab === 'audio' ? (
                <div className="text-center py-8">
                  <div className="mb-6">
                    <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-12 h-12 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      Audio Narration
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300 mb-6">
                      Listen to your content with text-to-speech
                    </p>
                  </div>
                  
                  <button
                    onClick={() => handlePlayAudio(getCurrentContent())}
                    disabled={!speechSynthesis}
                    className={`px-8 py-3 rounded-lg font-medium transition-colors ${
                      isPlaying
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    } disabled:bg-gray-400 disabled:cursor-not-allowed`}
                  >
                    {isPlaying ? '⏹️ Stop Audio' : '▶️ Play Audio'}
                  </button>
                  
                  {!speechSynthesis && (
                    <p className="text-red-600 dark:text-red-400 text-sm mt-4">
                      Speech synthesis is not supported in your browser.
                    </p>
                  )}
                </div>
              ) : (
                <div className="prose prose-lg max-w-none dark:prose-invert">
                  <pre className="whitespace-pre-wrap font-sans text-gray-900 dark:text-white leading-relaxed">
                    {getCurrentContent()}
                  </pre>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex justify-between">
              <button
                onClick={() => router.push('/preview')}
                className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                ← Edit Content
              </button>
              <button
                onClick={handleNewContent}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Transform New Content
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
