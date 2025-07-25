import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
} from "firebase/firestore";
import { getAnalytics } from "firebase/analytics"; // Import getAnalytics
import ReactGA from "react-ga4"; // Import react-ga4 for tracking methods

// Declare global variables for ESLint in local development.
// These are provided by the Canvas environment when deployed.
// If not defined, they will be 'undefined' locally, which the logic handles.
// This explicit declaration helps ESLint understand these variables might exist globally.
const __firebase_config =
  typeof window !== "undefined" && window.__firebase_config !== undefined
    ? window.__firebase_config
    : undefined;
const __app_id =
  typeof window !== "undefined" && window.__app_id !== undefined
    ? window.__app_id
    : undefined;
const __initial_auth_token =
  typeof window !== "undefined" && window.__initial_auth_token !== undefined
    ? window.__initial_auth_token
    : undefined;

// Your web app's Firebase configuration (from your provided snippet)
const firebaseConfig = {
  apiKey: "AIzaSyDa2tZnSsSoGdlrzS6xn0_VWvqDkQ7PAUE",
  authDomain: "quizappmern.firebaseapp.com",
  projectId: "quizappmern",
  storageBucket: "quizappmern.firebasestorage.app",
  messagingSenderId: "438060218329",
  appId: "1:438060218329:web:50e3110bd1243add3e8bc8",
  measurementId: "G-PSZPYQ9BH3", // Your GA4 Measurement ID is here!
};

// Determine Firebase App Initialization based on environment
let firebaseAppInstance;
let analyticsInstance; // Variable to hold analytics instance
let appFirebaseConfigToUse = firebaseConfig; // Default to local config

if (__firebase_config) {
  // Check if Canvas global config exists
  try {
    appFirebaseConfigToUse = JSON.parse(__firebase_config);
  } catch (e) {
    console.error(
      "Error parsing __firebase_config from Canvas, falling back to local Firebase config:",
      e
    );
    // Fallback to local config already set as default
  }
}

// Initialize Firebase App
firebaseAppInstance = initializeApp(appFirebaseConfigToUse);

// Initialize Google Analytics 4 if measurementId is available in the used config
if (firebaseAppInstance.options.measurementId) {
  analyticsInstance = getAnalytics(firebaseAppInstance); // Get analytics instance from the initialized app
  ReactGA.initialize(firebaseAppInstance.options.measurementId, {
    ga4bridge: analyticsInstance,
  });
  console.log(
    "GA4 Initialized with Measurement ID:",
    firebaseAppInstance.options.measurementId
  );
} else {
  console.warn(
    "GA4 Measurement ID not found in Firebase config. Google Analytics will not be active."
  );
}

const auth = getAuth(firebaseAppInstance);
const db = getFirestore(firebaseAppInstance);
// Use __app_id if available, otherwise fallback to a default for local testing
const currentAppId = __app_id || "default-quiz-app";

function App() {
  const [page, setPage] = useState("home"); // 'home', 'topics', 'instructions', 'quiz', 'results'
  const [quizzes, setQuizzes] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [score, setScore] = useState(0);
  const [quizTimer, setQuizTimer] = useState(0); // in seconds
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef(null); // Ref for setInterval

  const [userId, setUserId] = useState(null);
  const [totalUniqueVisitors, setTotalUniqueVisitors] = useState(0);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // --- Firebase Visitor Tracking and Auth Setup ---
  useEffect(() => {
    // Authenticate anonymously or re-use existing anonymous session
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        console.log("Firebase Authenticated User ID:", user.uid);

        // Record visit - CORRECTED PATH HERE
        const visitRef = doc(
          db,
          "artifacts",
          currentAppId,
          "public",
          "data",
          "visits",
          user.uid
        );
        try {
          const docSnap = await getDoc(visitRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            await setDoc(
              visitRef,
              {
                visitCount: (data.visitCount || 0) + 1,
                lastVisitAt: new Date().toISOString(),
                firstVisitAt: data.firstVisitAt || new Date().toISOString(),
              },
              { merge: true }
            );
          } else {
            await setDoc(visitRef, {
              visitCount: 1,
              firstVisitAt: new Date().toISOString(),
              lastVisitAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error("Error recording visit:", error);
        }
        setIsAuthReady(true);
      } else {
        // Sign in anonymously if no user is found
        // Use __initial_auth_token for Canvas, otherwise standard anonymous sign-in
        if (__initial_auth_token) {
          await signInAnonymously(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      }
    });

    return () => unsubscribeAuth(); // Cleanup auth listener
  }, []); // Run once on component mount

  // Listen for total unique visitors from Firestore
  useEffect(() => {
    if (!isAuthReady) return; // Wait until auth is ready

    // Listen for total unique visitors - CORRECTED PATH HERE
    const visitsCollectionRef = collection(
      db,
      "artifacts",
      currentAppId,
      "public",
      "data",
      "visits"
    );
    const unsubscribeVisitors = onSnapshot(
      visitsCollectionRef,
      (snapshot) => {
        setTotalUniqueVisitors(snapshot.size); // Count total documents (unique visitors)
      },
      (error) => {
        console.error("Error fetching unique visitors:", error);
      }
    );

    return () => unsubscribeVisitors(); // Cleanup snapshot listener
  }, [isAuthReady]); // Re-run when auth readiness changes

  // --- Quiz Logic ---

  // Fetch quizzes from backend
  useEffect(() => {
    const fetchQuizzes = async () => {
      try {
        const response = await axios.get("/api/quizzes");
        setQuizzes(response.data);
      } catch (error) {
        console.error("Error fetching quizzes:", error);
        alert(
          "Failed to load quizzes. Please check if the backend server is running."
        );
      }
    };
    fetchQuizzes();
  }, []);

  // Timer logic
  useEffect(() => {
    if (timerActive && quizTimer > 0) {
      timerRef.current = setInterval(() => {
        setQuizTimer((prevTime) => prevTime - 1);
      }, 1000);
    } else if (quizTimer === 0 && timerActive) {
      // Time's up! End quiz
      clearInterval(timerRef.current);
      setTimerActive(false);
      setPage("results");
    }
    return () => clearInterval(timerRef.current); // Cleanup on unmount or timer stop
  }, [quizTimer, timerActive]);

  // Google Analytics Page View Tracking
  useEffect(() => {
    // Construct a meaningful page path based on the current application state
    let pagePath;
    let pageTitle;

    switch (page) {
      case "home":
        pagePath = "/";
        pageTitle = "Home Page";
        break;
      case "topics":
        pagePath = "/topics";
        pageTitle = "Choose Quiz Topic";
        break;
      case "instructions":
        pagePath = `/instructions/${
          selectedTopic
            ? selectedTopic.replace(/\s+/g, "-").toLowerCase()
            : "unknown"
        }`;
        pageTitle = `Instructions - ${selectedTopic || "Unknown Topic"}`;
        break;
      case "quiz":
        pagePath = `/quiz/${selectedQuiz ? selectedQuiz.id : "unknown"}`;
        pageTitle = `Quiz - ${
          selectedQuiz ? selectedQuiz.name : "Unknown Quiz"
        }`;
        break;
      case "results":
        pagePath = `/results/${selectedQuiz ? selectedQuiz.id : "unknown"}`;
        pageTitle = `Results - ${
          selectedQuiz ? selectedQuiz.name : "Unknown Quiz"
        }`;
        break;
      default:
        pagePath = "/unknown";
        pageTitle = "Unknown Page";
    }

    // Send pageview event to Google Analytics
    if (ReactGA.isInitialized) {
      ReactGA.send({ hitType: "pageview", page: pagePath, title: pageTitle });
      console.log(
        `GA4: Sent pageview for path: ${pagePath}, title: ${pageTitle}`
      );
    } else {
      console.warn("GA4 not initialized. Pageview not sent.");
    }
  }, [page, selectedTopic, selectedQuiz]); // Dependencies for page view tracking

  const handleGetStarted = () => {
    setPage("home"); // Set to 'home' first to trigger GA pageview for '/'
    setTimeout(() => setPage("topics"), 50); // Then quickly transition to topics
  };

  const handleTopicSelect = (topic) => {
    setSelectedTopic(topic);
    setPage("instructions");
  };

  const handleStartQuiz = (quizId) => {
    const quizToStart = quizzes.find((q) => q.id === quizId);
    if (quizToStart) {
      // Fetch full quiz details (including questions) from backend
      axios
        .get(`/api/quizzes/${quizId}`)
        .then((response) => {
          setSelectedQuiz(response.data);
          setCurrentQuestionIndex(0);
          setScore(0);
          setSelectedAnswer(null);
          setQuizTimer(response.data.duration * 60); // Set timer in seconds
          setTimerActive(true);
          setPage("quiz");
          // Optionally, track a custom event for quiz start
          if (ReactGA.isInitialized) {
            ReactGA.event({
              category: "Quiz",
              action: "Quiz Started",
              label: quizToStart.name,
              value: quizToStart.duration, // Example: pass duration as value
            });
          }
        })
        .catch((error) => {
          console.error("Error fetching quiz details:", error);
          alert("Failed to load quiz details. Please try again.");
          setPage("topics"); // Go back to topics if failed
        });
    }
  };

  const handleAnswerSelect = (option) => {
    setSelectedAnswer(option);
    // Optionally, track a custom event for answer selection
    // if (ReactGA.isInitialized) {
    //   ReactGA.event({
    //     category: 'Quiz Interaction',
    //     action: 'Answer Selected',
    //     label: `Q${currentQuestionIndex + 1} - ${option}`,
    //     value: selectedQuiz.questions[currentQuestionIndex].correctAnswer === option ? 1 : 0 // 1 for correct, 0 for incorrect
    //   });
    // }
  };

  const handleNextQuestion = () => {
    if (selectedAnswer !== null) {
      if (
        selectedAnswer ===
        selectedQuiz.questions[currentQuestionIndex].correctAnswer
      ) {
        setScore((prevScore) => prevScore + 1);
      }
      setSelectedAnswer(null); // Reset selected answer for next question
      if (currentQuestionIndex < selectedQuiz.questions.length - 1) {
        setCurrentQuestionIndex((prevIndex) => prevIndex + 1);
      } else {
        // End of quiz
        setTimerActive(false);
        setPage("results");
        // Optionally, track a custom event for quiz completion
        if (ReactGA.isInitialized) {
          ReactGA.event({
            category: "Quiz",
            action: "Quiz Completed",
            label: selectedQuiz.name,
            value: score, // Total correct answers
          });
        }
      }
    } else {
      alert("Please select an answer before proceeding!");
    }
  };

  const handleGoHome = () => {
    setPage("home");
    setSelectedTopic(null);
    setSelectedQuiz(null);
    setCurrentQuestionIndex(0);
    setScore(0);
    setQuizTimer(0);
    setTimerActive(false);
    clearInterval(timerRef.current);
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  };

  const getPerformanceFeedback = (percentage) => {
    if (percentage === 100) return "Excellent! You aced it!";
    if (percentage >= 80)
      return "Great job! You have a strong grasp of the material.";
    if (percentage >= 60) return "Good effort! Keep practicing to improve.";
    if (percentage >= 40)
      return "You're getting there! Review the concepts and try again.";
    return "Keep learning! Don't give up, practice makes perfect.";
  };

  const getUniqueTopics = () => {
    const topics = new Set();
    quizzes.forEach((quiz) => topics.add(quiz.topic));
    return Array.from(topics);
  };

  const filteredQuizzes = selectedTopic
    ? quizzes.filter((quiz) => quiz.topic === selectedTopic)
    : quizzes;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white shadow-2xl rounded-2xl p-8 transform transition-all duration-300 ease-in-out hover:scale-[1.01]">
        {/* Home Page */}
        {page === "home" && (
          <div className="text-center">
            <h1 className="text-5xl font-extrabold text-blue-800 mb-6 drop-shadow-lg">
              Quiz Application
            </h1>
            <p className="text-lg text-gray-700 mb-8 max-w-2xl mx-auto">
              Welcome to the ultimate platform to test your knowledge! Select a
              topic and challenge yourself with our expertly crafted quizzes.
            </p>
            <button
              onClick={handleGetStarted}
              className="px-8 py-4 bg-blue-600 text-white text-xl font-semibold rounded-full shadow-lg hover:bg-blue-700 transform hover:scale-105 transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-blue-300"
            >
              Get Started
            </button>

            <div className="mt-12 text-left bg-gray-50 p-6 rounded-xl border border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                How to Use This Platform
              </h2>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>Click "Get Started" to view available quiz topics.</li>
                <li>Choose your desired topic from the list.</li>
                <li>
                  Read the instructions carefully, then click "Start Quiz".
                </li>
                <li>Answer questions within the given time limit.</li>
                <li>
                  Review your results and performance feedback at the end.
                </li>
                <li>Go back to the home page to try another quiz!</li>
              </ul>
            </div>

            <div className="mt-10 pt-4 border-t border-gray-200 text-gray-600 text-sm">
              {isAuthReady ? (
                <>
                  <p>
                    Total Unique Visitors:{" "}
                    <span className="font-bold text-blue-600">
                      {totalUniqueVisitors}
                    </span>
                  </p>
                  <p>
                    Your Anonymous User ID:{" "}
                    <span className="font-mono text-xs break-all">
                      {userId || "Loading..."}
                    </span>
                  </p>
                </>
              ) : (
                <p>Loading visitor data...</p>
              )}
            </div>
          </div>
        )}

        {/* Choose Quiz Topic Page */}
        {page === "topics" && (
          <div className="text-center">
            <h2 className="text-4xl font-bold text-gray-800 mb-8">
              Choose Quiz Topic
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {getUniqueTopics().length > 0 ? (
                getUniqueTopics().map((topic) => (
                  <button
                    key={topic}
                    onClick={() => handleTopicSelect(topic)}
                    className="flex flex-col items-center justify-center p-6 bg-purple-500 text-white rounded-xl shadow-md hover:bg-purple-600 transform hover:scale-105 transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-purple-300 min-h-[120px]"
                  >
                    <span className="text-2xl font-semibold">{topic}</span>
                  </button>
                ))
              ) : (
                <p className="col-span-full text-gray-600 text-lg">
                  No topics available. Please add quizzes via the backend.
                </p>
              )}
            </div>
            <button
              onClick={handleGoHome}
              className="mt-10 px-6 py-2 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-gray-300"
            >
              Back to Topics
            </button>
          </div>
        )}

        {/* Instructions Page */}
        {page === "instructions" && selectedTopic && (
          <div className="text-center">
            <h2 className="text-4xl font-bold text-gray-800 mb-6">
              Instructions for {selectedTopic} Quizzes
            </h2>
            <p className="text-lg text-gray-700 mb-8">
              Select a quiz from the list below. Once you start, a timer will
              begin. Answer all questions before the time runs out!
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {filteredQuizzes.map((quiz) => (
                <div
                  key={quiz.id}
                  className="bg-green-100 p-5 rounded-lg shadow-md flex flex-col justify-between items-start text-left"
                >
                  <div>
                    <h3 className="text-2xl font-bold text-green-800 mb-2">
                      {quiz.name}
                    </h3>
                    <p className="text-green-700 text-sm mb-2">
                      {quiz.description}
                    </p>
                    <p className="text-green-600 text-sm">
                      Questions:{" "}
                      {quiz.questions ? quiz.questions.length : "Loading..."}
                    </p>
                    <p className="text-green-600 text-sm">
                      Duration: {quiz.duration} minutes
                    </p>
                  </div>
                  <button
                    onClick={() => handleStartQuiz(quiz.id)}
                    className="mt-4 px-6 py-2 bg-green-600 text-white rounded-full shadow-md hover:bg-green-700 transform hover:scale-105 transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-green-300"
                  >
                    Start Quiz
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setPage("topics")}
              className="px-6 py-2 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-gray-300"
            >
              Back to Topics
            </button>
          </div>
        )}

        {/* Quiz Page */}
        {page === "quiz" && selectedQuiz && (
          <div className="text-center">
            <h2 className="text-4xl font-bold text-gray-800 mb-6">
              {selectedQuiz.name}
            </h2>
            <div className="text-2xl font-bold text-red-600 mb-4">
              Time Left: {formatTime(quizTimer)}
            </div>

            {selectedQuiz.questions && selectedQuiz.questions.length > 0 ? (
              <div className="bg-blue-50 p-8 rounded-xl shadow-lg mb-8">
                <p className="text-xl font-semibold text-gray-800 mb-6">
                  Question {currentQuestionIndex + 1} of{" "}
                  {selectedQuiz.questions.length}:
                </p>
                <p className="text-2xl text-blue-900 mb-8">
                  {selectedQuiz.questions[currentQuestionIndex].questionText}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedQuiz.questions[currentQuestionIndex].options.map(
                    (option, index) => (
                      <button
                        key={index}
                        onClick={() => handleAnswerSelect(option)}
                        className={`block w-full text-left p-4 rounded-lg border-2 text-lg transition-all duration-200 ease-in-out
                        ${
                          selectedAnswer === option
                            ? "bg-blue-600 border-blue-700 text-white shadow-lg"
                            : "bg-white border-blue-300 text-blue-800 hover:bg-blue-100"
                        } focus:outline-none focus:ring-4 focus:ring-blue-300`}
                      >
                        {option}
                      </button>
                    )
                  )}
                </div>
              </div>
            ) : (
              <p className="text-lg text-gray-600">Loading questions...</p>
            )}

            <button
              onClick={handleNextQuestion}
              disabled={selectedAnswer === null}
              className="px-8 py-4 bg-blue-600 text-white text-xl font-semibold rounded-full shadow-lg hover:bg-blue-700 transform hover:scale-105 transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {currentQuestionIndex < selectedQuiz.questions.length - 1
                ? "Next Question"
                : "Finish Quiz"}
            </button>
          </div>
        )}

        {/* Results Page */}
        {page === "results" && selectedQuiz && (
          <div className="text-center">
            <h2 className="text-4xl font-bold text-green-700 mb-6">
              Quiz Results
            </h2>
            <div className="bg-green-50 p-8 rounded-xl shadow-lg mb-8">
              <p className="text-3xl font-semibold text-green-900 mb-4">
                You scored: {score} / {selectedQuiz.questions.length}
              </p>
              <p className="text-4xl font-extrabold text-green-800 mb-6">
                {((score / selectedQuiz.questions.length) * 100).toFixed(0)}%
              </p>
              <p className="text-xl text-gray-700">
                {getPerformanceFeedback(
                  (score / selectedQuiz.questions.length) * 100
                )}
              </p>
            </div>
            <button
              onClick={handleGoHome}
              className="px-8 py-4 bg-blue-600 text-white text-xl font-semibold rounded-full shadow-lg hover:bg-blue-700 transform hover:scale-105 transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-blue-300"
            >
              Go to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
