'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Preview() {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [wordCount, setWordCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const extractedText = localStorage.getItem('extractedText');
    if (extractedText) {
      setText(extractedText);
      setWordCount(extractedText.split(' ').filter(word => word.length > 0).length);
    } else {
      router.push('/');
    }
    setIsLoading(false);
  }, [router]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);
    setWordCount(newText.split(' ').filter(word => word.length > 0).length);
  };

  const handleProceed = () => {
    if (text.trim()) {
      localStorage.setItem('extractedText', text);
      router.push('/results');
    }
  };

  const handleBack = () => {
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
            Preview & Edit
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Review and edit your text before transformation
          </p>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            {/* Text Stats */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Word count: <span className="font-semibold">{wordCount}</span>
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Characters: <span className="font-semibold">{text.length}</span>
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Ready to process</span>
              </div>
            </div>

            {/* Text Editor */}
            <div className="mb-6">
              <label htmlFor="text-editor" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Your Text Content
              </label>
              <textarea
                id="text-editor"
                value={text}
                onChange={handleTextChange}
                className="w-full h-96 p-4 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                placeholder="Your extracted text will appear here..."
              />
            </div>

            {/* Guidelines */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                💡 Tips for better results:
              </h3>
              <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                <li>• Remove any irrelevant content or formatting artifacts</li>
                <li>• Ensure the text is clear and well-structured</li>
                <li>• Keep the main learning objectives intact</li>
                <li>• The system will NOT generate homework answers - only explanations</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between">
              <button
                onClick={handleBack}
                className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                ← Back to Upload
              </button>
              <button
                onClick={handleProceed}
                disabled={!text.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Transform Content →
              </button>
            </div>
          </div>

          {/* Assignment Detection Warning */}
          {text.toLowerCase().includes('assignment') || 
           text.toLowerCase().includes('homework') || 
           text.toLowerCase().includes('solve') ||
           text.toLowerCase().includes('answer') ? (
            <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-200">
                    Assignment Content Detected
                  </h3>
                  <p className="text-sm text-yellow-800 dark:text-yellow-300 mt-1">
                    This appears to be assignment content. LearnEase will provide explanations, hints, and learning structure - but will not generate final answers or complete your homework.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
