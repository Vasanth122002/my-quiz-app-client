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
import { getAnalytics } from "firebase/analytics";
import ReactGA from "react-ga4";

// Declare global variables for ESLint in local development.
// These are placeholders for potential environment variables in a real deployment
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

// Your web app's Firebase configuration - REPLACE WITH YOUR ACTUAL CONFIG IN PRODUCTION
const firebaseConfig = {
  apiKey: "AIzaSyDa2tZnSsSoGdlrzS6xn0_VWvqDkQ7PAUE", // Use your actual API Key
  authDomain: "quizappmern.firebaseapp.com",
  projectId: "quizappmern",
  storageBucket: "quizappmern.firebasestorage.app",
  messagingSenderId: "438060218329",
  appId: "1:438060218329:web:50e3110bd1243add3e8bc8",
  measurementId: "G-PSZPYQ9BH3", // Your GA4 Measurement ID
};

let firebaseAppInstance;
let analyticsInstance;
let appFirebaseConfigToUse = firebaseConfig;

// Attempt to parse Firebase config from global variable if available (e.g., in a Canvas environment)
if (__firebase_config) {
  try {
    appFirebaseConfigToUse = JSON.parse(__firebase_config);
  } catch (e) {
    console.error(
      "Error parsing __firebase_config from Canvas, falling back to local Firebase config:",
      e
    );
  }
}

// Initialize Firebase App
firebaseAppInstance = initializeApp(appFirebaseConfigToUse);

// Initialize Google Analytics 4 if measurementId is available
if (firebaseAppInstance.options.measurementId) {
  analyticsInstance = getAnalytics(firebaseAppInstance);
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
const currentAppId = __app_id || "default-quiz-app"; // Default app ID if not provided

function App() {
  // State to manage current page view
  const [page, setPage] = useState("home"); // Possible values: 'home', 'topics', 'instructions', 'quiz', 'results', 'about', 'privacy', 'terms', 'blog', 'blogPost'

  // Quiz-related states
  // Initialized as an empty array to prevent 'forEach is not a function' errors
  const [quizzes, setQuizzes] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});
  const [score, setScore] = useState(0);
  const [quizTimer, setQuizTimer] = useState(0); // in seconds
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef(null); // Ref for timer interval

  // Firebase/Analytics related states
  const [userId, setUserId] = useState(null);
  const [totalUniqueVisitors, setTotalUniqueVisitors] = useState(0);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Dynamic content states for AdSense optimization
  const [topicDescription, setTopicDescription] = useState(null);
  const [quizIntroText, setQuizIntroText] = useState(null);

  // Blog-related states
  const [selectedBlogPost, setSelectedBlogPost] = useState(null);

  // --- Firebase Visitor Tracking and Authentication ---
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        console.log("Firebase Authenticated User ID:", user.uid);

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
        if (__initial_auth_token) {
          await signInAnonymously(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      }
    });

    return () => unsubscribeAuth(); // Cleanup subscription on component unmount
  }, []);

  // Listen for total unique visitors from Firestore in real-time
  useEffect(() => {
    if (!isAuthReady) return; // Wait for authentication to be ready

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
        setTotalUniqueVisitors(snapshot.size);
      },
      (error) => {
        console.error("Error fetching unique visitors:", error);
      }
    );

    return () => unsubscribeVisitors(); // Cleanup subscription
  }, [isAuthReady]);

  // --- Quiz Logic and Data Fetching ---

  // Fetch quizzes from backend when component mounts
  useEffect(() => {
    const fetchQuizzes = async () => {
      try {
        const response = await axios.get("/api/quizzes");
        // Ensure the response data is an array before setting state
        if (Array.isArray(response.data)) {
          setQuizzes(response.data);
        } else {
          console.error("API did not return an array for quizzes:", response.data);
          setQuizzes([]); // Default to empty array on unexpected response
        }
      } catch (error) {
        console.error("Error fetching quizzes:", error);
        alert(
          "Failed to load quizzes. Please check if the backend server is running and returning an array."
        );
        setQuizzes([]); // Ensure quizzes is an empty array even on error
      }
    };
    fetchQuizzes();
  }, []); // Empty dependency array means this runs once on mount

  // Quiz Timer logic
  useEffect(() => {
    if (timerActive && quizTimer > 0) {
      timerRef.current = setInterval(() => {
        setQuizTimer((prevTime) => prevTime - 1);
      }, 1000);
    } else if (quizTimer === 0 && timerActive) {
      // Time's up, end quiz
      clearInterval(timerRef.current);
      setTimerActive(false);
      setPage("results");
    }
    return () => clearInterval(timerRef.current); // Cleanup interval
  }, [quizTimer, timerActive]);

  // Google Analytics Page View Tracking
  useEffect(() => {
    let pagePath;
    let pageTitle;

    // Determine page path and title for GA4
    switch (page) {
      case "home":
        pagePath = "/";
        pageTitle = "Home Page";
        break;
      case "topics":
        pagePath = "/topics";
        pageTitle = "Choose Programming Quiz Topic";
        break;
      case "instructions":
        pagePath = `/instructions/${
          selectedTopic
            ? selectedTopic.replace(/\s+/g, "-").toLowerCase()
            : "unknown"
        }`;
        pageTitle = `Instructions - ${selectedTopic || "Unknown Programming Topic"}`;
        break;
      case "quiz":
        pagePath = `/quiz/${selectedQuiz ? selectedQuiz.id : "unknown"}`;
        pageTitle = `Programming Quiz - ${
          selectedQuiz ? selectedQuiz.name : "Unknown Quiz"
        }`;
        break;
      case "results":
        pagePath = `/results/${selectedQuiz ? selectedQuiz.id : "unknown"}`;
        pageTitle = `Results - ${
          selectedQuiz ? selectedQuiz.name : "Unknown Quiz"
        }`;
        break;
      case "about":
        pagePath = "/about";
        pageTitle = "About This Application";
        break;
      case "privacy":
        pagePath = "/privacy-policy";
        pageTitle = "Privacy Policy";
        break;
      case "terms":
        pagePath = "/terms-of-service";
        pageTitle = "Terms of Service";
        break;
      case "blog":
        pagePath = "/blog";
        pageTitle = "Programming Blog";
        break;
      case "blogPost":
        pagePath = `/blog/${selectedBlogPost ? selectedBlogPost.id : "unknown-post"}`;
        pageTitle = `Blog Post - ${
          selectedBlogPost ? selectedBlogPost.title : "Unknown Blog Post"
        }`;
        break;
      default:
        pagePath = "/unknown";
        pageTitle = "Unknown Page";
    }

    // Send pageview hit to GA4 if initialized
    if (ReactGA.isInitialized) {
      ReactGA.send({ hitType: "pageview", page: pagePath, title: pageTitle });
      console.log(
        `GA4: Sent pageview for path: ${pagePath}, title: ${pageTitle}`
      );
    } else {
      console.warn("GA4 not initialized. Pageview not sent.");
    }
  }, [page, selectedTopic, selectedQuiz, selectedBlogPost]); // Dependencies for page view tracking

  // --- Handlers for Page Navigation and Quiz Flow ---

  const handleGetStarted = () => {
    setPage("home"); // Optional: small delay to show transition
    setTimeout(() => setPage("topics"), 50);
  };

  const handleTopicSelect = (topic) => {
    setSelectedTopic(topic);
    setPage("instructions");
    // This description would ideally come from a backend API call for the topic
    setTopicDescription(`Explore the core concepts and practical applications of **${topic}**! Our quizzes cover
      syntax, data structures, algorithms, problem-solving, and best practices within this programming domain.
      Prepare to challenge your coding understanding and reinforce your learning with our
      carefully curated questions. This section is designed to deepen your proficiency
      and ignite your passion for ${topic} programming.`);
  };

  const handleStartQuiz = (quizId) => {
    const quizToStart = quizzes.find((q) => q.id === quizId);
    if (quizToStart) {
      axios
        .get(`/api/quizzes/${quizId}`) // Fetch full quiz details from backend
        .then((response) => {
          setSelectedQuiz(response.data);
          setCurrentQuestionIndex(0);
          setScore(0);
          setSelectedAnswer(null);
          setUserAnswers({}); // Reset user answers for a new quiz
          setQuizTimer(response.data.duration * 60); // Set timer based on quiz duration
          setTimerActive(true);
          setPage("quiz");
          // Placeholder for quiz-specific introduction text
          setQuizIntroText(response.data.introduction || `This quiz will challenge your knowledge on ${quizToStart.topic} with specific questions related to ${quizToStart.name.toLowerCase()}. Get ready to test your understanding of key programming concepts and important details. You have ${response.data.duration} minutes to complete ${response.data.questions.length} questions. Good luck with your coding challenge!`);
          if (ReactGA.isInitialized) {
            ReactGA.event({
              category: "Quiz",
              action: "Quiz Started",
              label: quizToStart.name,
              value: quizToStart.duration,
            });
          }
        })
        .catch((error) => {
          console.error("Error fetching quiz details:", error);
          alert("Failed to load quiz details. Please try again.");
          setPage("topics"); // Go back to topics if quiz fails to load
        });
    }
  };

  const handleAnswerSelect = (option) => {
    setSelectedAnswer(option);
    // Store the user's answer for later review on the results page
    setUserAnswers((prev) => ({
      ...prev,
      [currentQuestionIndex]: option,
    }));
  };

  const handleNextQuestion = () => {
    if (selectedAnswer !== null) {
      // Check if the selected answer is correct
      if (
        selectedAnswer ===
        selectedQuiz.questions[currentQuestionIndex].correctAnswer
      ) {
        setScore((prevScore) => prevScore + 1);
      }
      setSelectedAnswer(null); // Reset selected answer for next question

      // Move to next question or finish quiz
      if (currentQuestionIndex < selectedQuiz.questions.length - 1) {
        setCurrentQuestionIndex((prevIndex) => prevIndex + 1);
      } else {
        setTimerActive(false); // Stop the timer
        setPage("results"); // Navigate to results page
        if (ReactGA.isInitialized) {
          ReactGA.event({
            category: "Quiz",
            action: "Quiz Completed",
            label: selectedQuiz.name,
            value: score,
          });
        }
      }
    } else {
      alert("Please select an answer before proceeding!");
    }
  };

  const handleGoHome = () => {
    // Reset all relevant states to return to a clean home state
    setPage("home");
    setSelectedTopic(null);
    setSelectedQuiz(null);
    setCurrentQuestionIndex(0);
    setScore(0);
    setUserAnswers({});
    setQuizTimer(0);
    setTimerActive(false);
    clearInterval(timerRef.current);
    setTopicDescription(null);
    setQuizIntroText(null);
    setSelectedBlogPost(null); // Clear selected blog post
  };

  // Utility function to format time for the quiz timer
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  };

  // Feedback for quiz results
  const getPerformanceFeedback = (percentage) => {
    if (percentage === 100) return "Excellent! You aced it! A true coding master!";
    if (percentage >= 80)
      return "Great job! You have a strong grasp of programming concepts.";
    if (percentage >= 60) return "Good effort! Keep coding and practicing to improve.";
    if (percentage >= 40)
      return "You're getting there! Review the programming concepts and try again.";
    return "Keep learning! Don't give up on coding, practice makes perfect.";
  };

  // Extract unique topics from available quizzes
  const getUniqueTopics = () => {
    // Ensure quizzes is an array before attempting to iterate
    if (!Array.isArray(quizzes)) {
      console.warn("Quizzes data is not an array, defaulting to empty for topics.");
      return [];
    }
    const topics = new Set();
    quizzes.forEach((quiz) => topics.add(quiz.topic));
    return Array.from(topics);
  };

  // Filter quizzes by selected topic
  const filteredQuizzes = selectedTopic
    ? quizzes.filter((quiz) => quiz.topic === selectedTopic)
    : quizzes;

  // --- Blog Post Data (for demonstration purposes) ---
  // In a real application, this would likely be fetched from a backend API
  // or a headless CMS, and fullContent would be fetched only when viewing a single post.
  const blogPosts = [
    {
      id: "understanding-async-js",
      title: "Understanding Asynchronous JavaScript: Callbacks, Promises, and Async/Await",
      author: "[Your Name]", // Replace with your name
      date: "July 20, 2025",
      excerpt: "Asynchronous programming is a fundamental concept in JavaScript that often confuses beginners. Learn about callbacks, promises, and the modern async/await syntax to write non-blocking code.",
      fullContent: `
        <p>Asynchronous programming is a fundamental concept in JavaScript that often
        confuses beginners. Unlike synchronous code that executes line by line,
        asynchronous operations allow your program to perform long-running tasks
        (like fetching data from a server, reading files, or timers) without blocking the main thread. This
        is crucial for building responsive web applications and ensuring a smooth user experience.
        If your JavaScript code was purely synchronous, a network request taking 2 seconds would
        freeze your entire browser tab for that duration!</p>

        <h3>Callbacks: The Traditional Approach</h3>
        <p>Historically, JavaScript handled asynchronicity using <b>callbacks</b>. A callback function is simply a function
        that is passed as an argument to another function, to be executed later. For example, when fetching data:</p>
        <pre><code class="language-js">
        function fetchData(url, callback) {
          // Simulate network request
          setTimeout(() => {
            const data = { message: "Data fetched!" };
            callback(data);
          }, 1000);
        }

        fetchData('/api/data', function(data) {
          console.log(data.message); // Data fetched!
          // Now do something else with data
        });
        </code></pre>
        <p>While functional, callbacks can lead to "callback hell" or "pyramid of doom" when dealing with
        multiple nested asynchronous operations that depend on each other. This makes code hard to read, maintain,
        and debug.</p>

        <h3>Promises: A Better Way to Handle Asynchronicity</h3>
        <p>The introduction of <b>Promises</b> in ES6 (ECMAScript 2015) significantly improved asynchronous programming.
        A Promise is an object representing the eventual completion (or failure) of an asynchronous operation and its
        resulting value. A Promise can be in one of three states:</p>
        <ul>
            <li><b>Pending:</b> Initial state, neither fulfilled nor rejected.</li>
            <li><b>Fulfilled:</b> Meaning that the operation completed successfully.</li>
            <li><b>Rejected:</b> Meaning that the operation failed.</li>
        </ul>
        <p>Promises offer a cleaner, more structured way to handle asynchronous flow using <code>.then()</code> for success
        and <code>.catch()</code> for errors:</p>
        <pre><code class="language-js">
        function fetchDataPromise(url) {
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              const success = true; // Simulate success or failure
              if (success) {
                resolve({ message: "Data fetched with Promise!" });
              } else {
                reject(new Error("Failed to fetch data with Promise."));
              }
            }, 1000);
          });
        }

        fetchDataPromise('/api/data')
          .then(data => {
            console.log(data.message);
          })
          .catch(error => {
            console.error(error.message);
          });
        </code></pre>
        <p>Promises facilitate chaining operations, making sequential asynchronous tasks much more manageable.</p>

        <h3>Async/Await: Synchronous-Looking Asynchronous Code</h3>
        <p>Finally, <b>Async/Await</b>, introduced in ES2017, provides an even more readable and synchronous-like syntax
        for asynchronous code. It is built on top of Promises and makes working with them much easier by
        allowing you to write <code>await</code> expressions that pause the execution of an <code>async</code> function until a Promise
        is resolved.</p>
        <pre><code class="language-js">
        async function getAndProcessData() {
          try {
            const data = await fetchDataPromise('/api/data'); // 'await' pauses here
            console.log(data.message);
            // You can await other promises here
            const moreData = await anotherAsyncOperation();
            console.log(moreData);
          } catch (error) {
            console.error("An error occurred:", error.message);
          }
        }

        getAndProcessData();
        </code></pre>
        <p>Using <code>async</code> and <code>await</code> makes asynchronous code flow logically, almost as if it were synchronous,
        significantly reducing complexity and improving readability, especially for complex operations.
        Mastering these concepts is key to writing efficient, modern, and maintainable JavaScript.</p>
      `
    },
    {
      id: "python-data-structures",
      title: "The Basics of Python Data Structures: Lists, Tuples, Sets, and Dictionaries",
      author: "[Your Name]", // Replace with your name
      date: "July 15, 2025",
      excerpt: "Python offers powerful built-in data structures. Learn about Lists, Tuples, Sets, and Dictionaries and when to use each for efficient data management.",
      fullContent: `
        <p>Python offers a rich set of built-in data structures that are
        essential for organizing and managing data efficiently. Understanding
        their characteristics and when to use each one is crucial for
        writing effective Python code and solving various programming problems.</p>

        <h3>Lists: Ordered, Mutable Collections</h3>
        <p><b>Lists</b> are arguably the most versatile and widely used data structure in Python. They are ordered,
        meaning elements have a defined sequence, and mutable, which means you can change their contents (add, remove, or modify elements)
        after creation. Lists can store items of different data types.</p>
        <pre><code class="language-python">
        my_list = [1, "hello", 3.14, True]
        my_list.append("world") # Add element
        my_list[0] = 10 # Modify element
        print(my_list) # Output: [10, 'hello', 3.14, True, 'world']
        </code></pre>
        <p>Lists are great for collections where order matters and you need to frequently modify the collection.</p>

        <h3>Tuples: Ordered, Immutable Collections</h3>
        <p><b>Tuples</b> are similar to lists in that they are ordered collections, but the key difference is their
        immutability. Once a tuple is created, its contents cannot be changed. Tuples are defined using parentheses <code>()</code>.</p>
        <pre><code class="language-python">
        my_tuple = (1, "hello", 3.14)
        # my_tuple.append("world") # This would raise an AttributeError
        print(my_tuple[0]) # Output: 1
        </code></pre>
        <p>Their immutability makes them useful for fixed collections of items, such as coordinates (x, y) or database records.
        They are also generally faster than lists for iteration and can be used as dictionary keys (unlike lists).</p>

        <h3>Sets: Unordered Collections of Unique Elements</h3>
        <p><b>Sets</b> are unordered collections of unique elements. This means a set cannot have duplicate values.
        They are primarily used for membership testing and for eliminating duplicate entries from a collection.
        Sets are defined using curly braces <code>{}</code> or the <code>set()</code> constructor.</p>
        <pre><code class="language-python">
        my_set = {1, 2, 3, 2, 1}
        print(my_set) # Output: {1, 2, 3} (duplicates removed)

        print(2 in my_set) # Output: True

        another_set = {3, 4, 5}
        print(my_set.union(another_set)) # Output: {1, 2, 3, 4, 5}
        </code></pre>
        <p>Sets are highly optimized for checking if an element exists within them and for performing mathematical set operations like union, intersection, and difference.</p>

        <h3>Dictionaries: Unordered Key-Value Pairs</h3>
        <p><b>Dictionaries</b> are unordered collections of key-value pairs. Each key must be unique, and it maps to a value.
        They are ideal for storing data in a structured way where you need to retrieve values based on a specific identifier (key).
        Dictionaries are defined using curly braces <code>{}</code> with key:value pairs.</p>
        <pre><code class="language-python">
        my_dict = {
          "name": "Alice",
          "age": 30,
          "city": "New York"
        }

        print(my_dict["name"]) # Output: Alice
        my_dict["age"] = 31 # Modify value
        my_dict["job"] = "Engineer" # Add new key-value pair
        print(my_dict) # Output: {'name': 'Alice', 'age': 31, 'city': 'New York', 'job': 'Engineer'}
        </code></pre>
        <p>Dictionaries provide extremely fast lookups by key, making them indispensable for managing related data.
        Choosing the right data structure can significantly impact your program's performance, memory usage, and readability.</p>
      `
    },
    {
      id: "effective-debugging-tips",
      title: "Effective Debugging Tips for Programmers",
      author: "[Your Name]", // Replace with your name
      date: "July 10, 2025",
      excerpt: "Bugs are an inevitable part of coding. Learn essential debugging strategies to quickly identify and fix issues in your code, saving you time and frustration.",
      fullContent: `
        <p>Debugging is an essential skill for any programmer. No matter how experienced you are,
        bugs are an inevitable part of the software development process. Learning to effectively
        debug your code can save you hours of frustration and significantly improve your productivity.</p>

        <h3>1. Understand the Problem</h3>
        <p>Before you even touch your code, take a moment to understand what the bug is.
        What are the symptoms? When does it occur? What did you expect to happen, and what
        actually happened? Can you reliably reproduce the bug? The more information you gather
        about the bug's behavior, the easier it will be to pinpoint its cause.</p>

        <h3>2. Use Print Statements (or Console Logs) Liberally</h3>
        <p>This is the simplest yet often most effective debugging technique. Insert print statements
        (e.g., <code>console.log()</code> in JavaScript, <code>print()</code> in Python) at various points in your code
        to inspect variable values, confirm code execution paths, and track the flow of your program.
        This helps you narrow down where the unexpected behavior begins.</p>
        <pre><code class="language-python">
        def calculate_total(price, quantity):
            print(f"DEBUG: Price = {price}, Quantity = {quantity}")
            total = price * quantity
            print(f"DEBUG: Calculated total = {total}")
            return total
        </code></pre>

        <h3>3. Learn Your IDE's Debugger</h3>
        <p>Modern Integrated Development Environments (IDEs) like VS Code, IntelliJ, or PyCharm
        come with powerful built-in debuggers. These tools allow you to set breakpoints,
        step through your code line by line, inspect the call stack, and examine variable
        values at any point during execution. Mastering your debugger is a significant
        leap in your debugging efficiency.</p>

        <h3>4. Isolate the Bug</h3>
        <p>If you're dealing with a large codebase, try to isolate the problematic section of code.
        Can you create a minimal reproducible example? Comment out sections of code,
        or create a simplified test case that demonstrates the bug. This helps to
        eliminate external factors and focus on the core issue.</p>

        <h3>5. Rubber Duck Debugging</h3>
        <p>This humorous but effective technique involves explaining your code, line by line,
        to an inanimate object (like a rubber duck) or even just to yourself out loud.
        The act of verbalizing your thought process often helps you spot errors or
        flawed assumptions you overlooked while silently reading the code.</p>

        <h3>6. Check Your Assumptions</h3>
        <p>Often, bugs arise because of incorrect assumptions about how a function works,
        what data it receives, or what condition is met. Double-check API documentation,
        verify input data, and confirm the state of your program at critical points.</p>

        <h3>7. Take Breaks</h3>
        <p>Sometimes, the best debugging strategy is to step away from the problem.
        A fresh perspective after a short break can help you spot the bug you've
        been staring at for hours. Your brain continues to work on the problem
        in the background, and you might return with a new idea.</p>

        <p>Debugging is a skill that improves with practice. By adopting these strategies,
        you'll become more proficient at finding and fixing bugs, making you a more
        confident and efficient programmer.</p>
      `
    }
  ];

  // Handler to navigate to a specific blog post
  const handleReadMore = (blogId) => {
    const post = blogPosts.find(p => p.id === blogId);
    if (post) {
      setSelectedBlogPost(post);
      setPage("blogPost"); // Change page to single blog post view
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white shadow-2xl rounded-2xl p-8 transform transition-all duration-300 ease-in-out hover:scale-[1.01]">
        {/* Global Navigation Bar */}
        <nav className="mb-6 flex justify-center space-x-4">
          <button onClick={handleGoHome} className="text-blue-600 hover:underline">Home</button>
          <button onClick={() => setPage('blog')} className="text-blue-600 hover:underline">Blog</button>
          <button onClick={() => setPage('about')} className="text-blue-600 hover:underline">About This App</button>
          <button onClick={() => setPage('privacy')} className="text-blue-600 hover:underline">Privacy Policy</button>
          <button onClick={() => setPage('terms')} className="text-blue-600 hover:underline">Terms of Service</button>
        </nav>

        <hr className="my-6 border-t-2 border-gray-200" />

        {/* Home Page */}
        {page === "home" && (
          <div className="text-center">
            <h1 className="text-5xl font-extrabold text-blue-800 mb-6 drop-shadow-lg">
              CodeCrafter Quizzes
            </h1>
            <p className="text-lg text-gray-700 mb-8 max-w-2xl mx-auto">
              Welcome to the ultimate platform to test your **programming knowledge and coding concepts**! Select a
              topic and challenge yourself with our expertly crafted quizzes. Our quizzes
              are designed not just to test what you know, but also to help you
              discover new facts and deepen your understanding across various
              programming languages and technical domains.
            </p>

            {/* Enhanced Home Page Content for AdSense (Programming/Coding Focused) */}
            <div className="mt-8 text-left bg-blue-50 p-6 rounded-xl border border-blue-200">
              <h2 className="text-2xl font-bold text-blue-800 mb-4">
                Master Programming and Coding with Engaging Quizzes
              </h2>
              <p className="text-gray-700 mb-4">
                Welcome to **CodeCrafter Quizzes**, your premier platform for testing and enhancing your programming knowledge!
                We offer a diverse range of quizzes covering core concepts in **Python, JavaScript, Java, C++, data structures, algorithms,
                object-oriented programming, web development fundamentals, cybersecurity basics, and more**. Each quiz is
                 meticulously designed by a dedicated programmer (that's me!) to provide an engaging and educational experience.
              </p>
              <p className="text-gray-700 mb-4">
                Whether you're a **student learning your first language, a developer looking to sharpen specific skills,
                an aspiring coder preparing for interviews**, or simply someone passionate about the logic and art of programming,
                you'll find quizzes that challenge, inform, and entertain. Our interactive format makes learning complex coding concepts
                enjoyable and accessible for all levels.
              </p>
              <p className="text-gray-700">
                I am constantly expanding this library with the latest programming trends, fundamental concepts, and practical coding challenges,
                ensuring there's always something new to explore. Dive in, discover your strengths, and solidify your understanding
                of the ever-evolving world of software development. Get started now and embark on your journey to becoming a coding master!
              </p>
            </div>

            <button
              onClick={handleGetStarted}
              className="px-8 py-4 bg-blue-600 text-white text-xl font-semibold rounded-full shadow-lg hover:bg-blue-700 transform hover:scale-105 transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-blue-300 mt-8"
            >
              Start Coding Quizzes
            </button>

            <div className="mt-12 text-left bg-gray-50 p-6 rounded-xl border border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                How to Use CodeCrafter Quizzes
              </h2>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>Click "Start Coding Quizzes" to view available programming topics.</li>
                <li>Choose your desired programming language or concept topic.</li>
                <li>
                  Read the instructions carefully, then click "Start Quiz".
                </li>
                <li>Answer questions within the given time limit, focusing on accuracy.</li>
                <li>
                  Review your results and performance feedback at the end to learn from mistakes.
                </li>
                <li>Go back to the home page to try another coding challenge!</li>
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
              Choose Your Programming Topic
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Ensure getUniqueTopics returns an array before mapping */}
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
                  No programming topics available. Please add quizzes via the backend.
                </p>
              )}
            </div>
            <button
              onClick={handleGoHome}
              className="mt-10 px-6 py-2 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-gray-300"
            >
              Back to Home
            </button>
          </div>
        )}

        {/* Instructions Page */}
        {page === "instructions" && selectedTopic && (
          <div className="text-center">
            <h2 className="text-4xl font-bold text-gray-800 mb-6">
              Instructions for {selectedTopic} Quizzes
            </h2>

            {/* Dynamic Topic Introduction/Description for AdSense */}
            <div className="bg-purple-50 p-6 rounded-xl shadow-inner mb-8 text-left">
              <h3 className="text-2xl font-semibold text-purple-800 mb-3">
                Dive Deep into {selectedTopic} Programming
              </h3>
              <p className="text-lg text-gray-700 mb-4">
                {topicDescription || "Loading topic description..."}
              </p>
            </div>

            <p className="text-lg text-gray-700 mb-8">
              Select a quiz from the list below. Once you start, a timer will
              begin. Answer all questions before the time runs out! Sharpen your coding logic!
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
                    {/* Optional: Add more text here for AdSense */}
                    {quiz.longDescription && (
                      <p className="text-green-700 text-xs mt-2 italic">
                        {quiz.longDescription.substring(0, 150)}...
                      </p>
                    )}
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

            {/* Quiz Specific Introduction - Visible during quiz if it's the first question */}
            {currentQuestionIndex === 0 && (
              <div className="bg-indigo-50 p-6 rounded-xl shadow-inner mb-8 text-left">
                <h3 className="text-2xl font-semibold text-indigo-800 mb-3">
                  About This Quiz: {selectedQuiz.name}
                </h3>
                <p className="text-lg text-gray-700 mb-4">
                  {quizIntroText || "Loading quiz introduction..."}
                </p>
              </div>
            )}

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
              <p className="text-xl text-gray-700 mb-4">
                {getPerformanceFeedback(
                  (score / selectedQuiz.questions.length) * 100
                )}
              </p>

              {/* Detailed Review and Explanations for AdSense */}
              <div className="mt-8 text-left bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-2xl font-bold text-gray-800 mb-4">
                  Detailed Review and Explanations
                </h3>
                {selectedQuiz.questions.map((question, index) => {
                  const userAnswer = userAnswers[index];
                  const isCorrect = userAnswer === question.correctAnswer;
                  return (
                    <div key={index} className="mb-6 p-4 border-b border-gray-100 last:border-b-0">
                      <p className="font-semibold text-xl mb-2">
                        Question {index + 1}: {question.questionText}
                      </p>
                      <p className="text-sm text-gray-600 mb-1">
                        Your Answer:{" "}
                        <span className={isCorrect ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                          {userAnswer || "Not answered"}
                        </span>
                      </p>
                      <p className="text-sm text-gray-600 mb-2">
                        Correct Answer:{" "}
                        <span className="text-blue-700 font-medium">
                          {question.correctAnswer}
                        </span>
                      </p>
                      {/* Placeholder for question explanation from backend */}
                      <p className="text-gray-700 text-base mt-2">
                        <span className="font-semibold">Explanation:</span>{" "}
                        {question.explanation ||
                          "A detailed explanation for this programming concept will be provided here. This section is designed to give you a deeper understanding of the code logic, algorithms, or principles involved, clarifying why the correct answer is the best choice and addressing common misconceptions from other options. Reviewing these explanations is key to improving your coding skills!"}
                      </p>
                    </div>
                  );
                })}

                <div className="mt-6 pt-4 border-t border-gray-200">
                  <h3 className="text-2xl font-bold text-gray-800 mb-3">
                    What's Next? Continue Coding!
                  </h3>
                  <p className="text-gray-700 mb-4">
                    You've completed the "{selectedQuiz.name}" quiz! Programming is a
                    continuous journey. To further enhance your knowledge on{" "}
                    <span className="font-bold">{selectedQuiz.topic}</span>, consider
                    exploring the following:
                  </p>
                  <ul className="list-disc list-inside text-gray-700 space-y-2">
                    <li>
                      **Explore more quizzes:** Navigate back to the topics page and
                      try another quiz in a related programming area.
                    </li>
                    <li>
                      **Practice coding:** The best way to learn is by doing! Head to your favorite IDE and start coding.
                    </li>
                    <li>
                      **Consult Documentation:** Refer to official language documentation for deeper understanding.
                    </li>
                    <li>
                      **Read our Blog:** Check out our latest articles for coding tips and insights!
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <button
              onClick={handleGoHome}
              className="px-8 py-4 bg-blue-600 text-white text-xl font-semibold rounded-full shadow-lg hover:bg-blue-700 transform hover:scale-105 transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-blue-300"
            >
              Go to Home
            </button>
          </div>
        )}

        {/* --- AdSense Compliance and Content Richness Pages --- */}
        <hr className="my-6 border-t-2 border-gray-200" />

        {/* About Us Page */}
        {page === "about" && (
          <div className="text-center">
            <h2 className="text-4xl font-bold text-gray-800 mb-6">About CodeCrafter Quizzes</h2>
            <div className="text-left bg-gray-50 p-8 rounded-xl shadow-lg mb-8">
              <p className="text-lg text-gray-700 mb-4">
                Welcome to **CodeCrafter Quizzes**! I am passionate about making **programming and coding concept learning engaging, accessible, and fun** for everyone. My mission is to provide a high-quality platform where you can **test and expand your knowledge across a wide array of programming languages and technical subjects**, from foundational syntax to advanced algorithmic thinking. My goal is to help you learn new coding facts and deepen your understanding of software development.
              </p>
              <p className="text-lg text-gray-700 mb-4">
                As the sole creator of this application, I meticulously design each quiz and question to ensure **accuracy, relevance, and an enjoyable learning experience**. I believe that interactive quizzes are a powerful tool for **coding education and personal development in tech**, offering immediate feedback and highlighting areas for further exploration in your journey through the ever-evolving landscape of programming.
              </p>
              <p className="text-lg text-gray-700 mb-4">
                I am committed to continuously expanding this quiz library, covering everything from **Python, JavaScript, Java, and C++ fundamentals to data structures, algorithms, object-oriented programming, web development frameworks, database concepts, and more**. Your curiosity for coding is my inspiration!
              </p>
              <p className="text-lg text-gray-700">
                Thank you for being a part of this learning community. I hope you enjoy
                the challenge and discover something new with every programming quiz you take!
              </p>
            </div>
            <button onClick={handleGoHome} className="px-6 py-2 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-gray-300">
              Back to Home
            </button>
          </div>
        )}

        {/* Privacy Policy Page */}
        {page === "privacy" && (
          <div className="text-center">
            <h2 className="text-4xl font-bold text-gray-800 mb-6">Privacy Policy</h2>
            <div className="text-left bg-gray-50 p-8 rounded-xl shadow-lg mb-8">
              <p className="text-lg text-gray-700 mb-4">
                **Effective Date:** July 26, 2025
              </p>
              <p className="text-lg text-gray-700 mb-4">
                Your privacy is important to me. This Privacy Policy explains how
                I, **[Your Full Name/Developer Name]** (the "Developer," "I," or "me"), the sole owner and operator of
                **CodeCrafter Quizzes** (the "App"), collect, use, and disclose information about you when you use my quiz application.
              </p>
              <h3 className="text-2xl font-bold text-gray-800 mb-3">1. Information I Collect</h3>
              <p className="text-lg text-gray-700 mb-2">
                I collect information to provide and improve my App to you.
                The types of information I collect include:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 pl-4">
                <li>
                  **Anonymous Usage Data:** I use Google Analytics 4 (GA4) and
                  Firebase to collect anonymous data about how users interact with
                  my App, such as pages visited, quizzes taken, time spent on the App,
                  and device information. This data is aggregated and does not
                  personally identify you.
                </li>
                <li>
                  **Firebase Anonymous Authentication:** I use Firebase Anonymous
                  Authentication to provide a persistent, anonymous user ID for each
                  visitor. This helps me track unique visitors and basic usage
                  patterns within the App without collecting personal information.
                </li>
                <li>
                  **No Personal Identifiable Information (PII):** I do not intentionally
                  collect any personally identifiable information (e.g., names, email
                  addresses, contact details) from users through the App itself. All quiz interactions
                  and scores are stored anonymously.
                </li>
              </ul>

              <h3 className="text-2xl font-bold text-gray-800 mb-3">2. How I Use Your Information</h3>
              <p className="text-lg text-gray-700 mb-4">
                I use the anonymous information I collect for the following purposes:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 pl-4">
                <li>To operate, maintain, and improve the App and its programming quiz features.</li>
                <li>To understand and analyze how users interact with the App, to make it more engaging and effective for learning.</li>
                <li>To monitor and analyze trends, usage, and activities in connection with the App's performance.</li>
                <li>To display relevant advertisements through services like Google AdSense (once approved), based on general usage patterns.</li>
              </ul>

              <h3 className="text-2xl font-bold text-gray-800 mb-3">3. How I Share Your Information</h3>
              <p className="text-lg text-gray-700 mb-4">
                I do not share your personal identifiable information with third parties, because I do not collect any.
                I may share aggregated or de-identified information, which cannot reasonably
                be used to identify you, for various purposes, including for analytical
                or operational improvements.
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 pl-4">
                <li>
                  **Service Providers:** I may share anonymous usage data with third-party
                  service providers like Google Analytics and Firebase for analytics and
                  anonymous authentication purposes. These providers are bound by their own privacy policies.
                </li>
                <li>
                  **Legal Compliance:** I may disclose anonymous user IDs if required to do so
                  by law or in the good faith belief that such action is necessary to comply
                  with a legal obligation, protect my rights or property, or prevent fraud.
                </li>
              </ul>

              <h3 className="text-2xl font-bold text-gray-800 mb-3">4. Third-Party Advertising (Google AdSense)</h3>
              <p className="text-lg text-gray-700 mb-4">
                I intend to use Google AdSense to serve advertisements on this App.
                Google AdSense may use cookies to serve ads based on your prior visits
                to this App or other websites. Google's use of advertising cookies enables
                it and its partners to serve ads to users based on their visit to your
                sites and/or other sites on the Internet.
              </p>
              <p className="text-lg text-gray-700 mb-4">
                You may opt out of personalized advertising by visiting Ads Settings.
                Alternatively, you can opt out of a third-party vendor's use of cookies
                for personalized advertising by visiting <a href="http://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">www.aboutads.info/choices/</a>.
              </p>

              <h3 className="text-2xl font-bold text-gray-800 mb-3">5. Data Security</h3>
              <p className="text-lg text-gray-700 mb-4">
                I implement reasonable security measures designed to protect the information
                I collect (which is anonymous usage data) from unauthorized access, disclosure, alteration, and destruction.
                However, no security system is impenetrable, and I cannot guarantee the
                absolute security of my systems.
              </p>

              <h3 className="text-2xl font-bold text-gray-800 mb-3">6. Children's Privacy</h3>
              <p className="text-lg text-gray-700 mb-4">
                This App is not intended for use by children under the age of 13. I do not knowingly
                collect personally identifiable information from children under 13. If I become
                aware that a child under 13 has provided me with personal information, I will
                take steps to delete such information from my files.
              </p>

              <h3 className="text-2xl font-bold text-gray-800 mb-3">7. Changes to This Privacy Policy</h3>
              <p className="text-lg text-gray-700 mb-4">
                I may update this Privacy Policy from time to time. I will notify you of
                any changes by posting the new Privacy Policy on this page. You are advised
                to review this Privacy Policy periodically for any changes.
              </p>

              <h3 className="text-2xl font-bold text-gray-800 mb-3">8. Contact Me</h3>
              <p className="text-lg text-gray-700">
                If you have any questions about this Privacy Policy, please contact me at **[Your Email Address, e.g., developer.codecrafter@email.com]**.
              </p>
            </div>
            <button onClick={handleGoHome} className="px-6 py-2 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-gray-300">
              Back to Home
            </button>
          </div>
        )}

        {/* Terms of Service Page */}
        {page === "terms" && (
          <div className="text-center">
            <h2 className="text-4xl font-bold text-gray-800 mb-6">Terms of Service</h2>
            <div className="text-left bg-gray-50 p-8 rounded-xl shadow-lg mb-8">
              <p className="text-lg text-gray-700 mb-4">
                **Last Updated:** July 26, 2025
              </p>
              <p className="text-lg text-gray-700 mb-4">
                Welcome to **CodeCrafter Quizzes**! These Terms of Service ("Terms") govern your access to
                and use of my quiz application (the "App"), provided by me, **[Your Full Name/Developer Name]** (the "Developer," "I," or "me").
                By accessing or using the App, you agree to be bound by these Terms.
              </p>

              <h3 className="text-2xl font-bold text-gray-800 mb-3">1. Acceptance of Terms</h3>
              <p className="text-lg text-gray-700 mb-4">
                By accessing or using the App, you acknowledge that you have read, understood,
                and agree to be bound by these Terms and my Privacy Policy. If you do not
                agree with these Terms, you may not use the App.
              </p>

              <h3 className="text-2xl font-bold text-gray-800 mb-3">2. Use of the App</h3>
              <ul className="list-disc list-inside text-gray-700 mb-4 pl-4">
                <li>
                  **Eligibility:** You must be at least 13 years of age to use the App. By using the App, you represent and warrant that you meet this age requirement.
                </li>
                <li>
                  **Permitted Use:** The App is provided for your personal, non-commercial use only, for the purpose of learning and testing programming and coding knowledge. You may not use the App for any illegal or unauthorized purpose.
                </li>
                <li>
                  **Prohibited Conduct:** You agree not to engage in any activity that interferes with or disrupts the App, including but not limited to:
                  <ul className="list-circle list-inside ml-6 mt-2">
                    <li>Distributing spam, malware, or other harmful content.</li>
                    <li>Attempting to gain unauthorized access to the App's systems or data.</li>
                    <li>Copying, modifying, or distributing any quiz content, questions, or explanations from the App without my express written permission.</li>
                    <li>Using automated systems or software to access or scrape content from the App, or to automate quiz taking.</li>
                    <li>Attempting to reverse engineer, decompile, or disassemble any part of the App.</li>
                  </ul>
                </li>
              </ul>

              <h3 className="text-2xl font-bold text-gray-800 mb-3">3. Intellectual Property</h3>
              <p className="text-lg text-gray-700 mb-4">
                All content on the App, including quizzes, questions, explanations, text, graphics,
                logos, and images, are my sole property as the Developer, or used under license,
                and are protected by intellectual property laws. You may not reproduce, distribute,
                modify, create derivative works of, publicly display, publicly perform, republish,
                download, store, or transmit any of the material on our App, except as generally
                and ordinarily permitted through the App's normal functionality.
              </p>
              <p className="text-lg text-gray-700 mb-4">
                The name "CodeCrafter Quizzes," and all related names, logos, product and service
                names, designs, and slogans are trademarks belonging to me. You must not use such marks
                without my prior written permission.
              </p>


              <h3 className="text-2xl font-bold text-gray-800 mb-3">4. Disclaimers</h3>
              <p className="text-lg text-gray-700 mb-4">
                The App is provided on an "as-is" and "as-available" basis. I make no warranties,
                expressed or implied, regarding the accuracy, reliability, or completeness of any
                programming content on the App or that the App will be uninterrupted, error-free,
                or secure. While I strive for accuracy in all programming questions and explanations,
                the field of technology is constantly evolving, and I cannot guarantee that all
                information will always be perfectly up-to-date or exhaustive.
              </p>

              <h3 className="text-2xl font-bold text-gray-800 mb-3">5. Limitation of Liability</h3>
              <p className="text-lg text-gray-700 mb-4">
                To the fullest extent permitted by applicable law, I, **[Your Full Name/Developer Name]**, shall
                not be liable for any indirect, incidental, special, consequential, or punitive damages,
                or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of
                data, use, goodwill, or other intangible losses, resulting from (a) your access to or
                use of or inability to access or use the App; (b) any conduct or content of any
                third party on the App; or (c) unauthorized access, use, or alteration of your transmissions
                or content. My total liability to you for any damages, losses, and causes of action
                (whether in contract, tort including negligence, or otherwise) will not exceed the
                amount paid by you, if any, for accessing the App during the twelve (12) months immediately
                preceding the date of the claim or one hundred U.S. dollars ($100), whichever is greater.
              </p>

              <h3 className="text-2xl font-bold text-gray-800 mb-3">6. Changes to Terms</h3>
              <p className="text-lg text-gray-700 mb-4">
                I reserve the right to modify or replace these Terms at any time. If a revision
                is material, I will provide at least 30 days' notice prior to any new terms
                taking effect. What constitutes a material change will be determined at my
                sole discretion. By continuing to access or use my App after those revisions
                become effective, you agree to be bound by the revised terms.
              </p>

              <h3 className="text-2xl font-bold text-gray-800 mb-3">7. Governing Law</h3>
              <p className="text-lg text-gray-700 mb-4">
                These Terms shall be governed and construed in accordance with the laws of **India, specifically Tamil Nadu**,
                without regard to its conflict of law provisions. Any legal action or proceeding arising
                under these Terms will be brought exclusively in the courts located in **Madurai, Tamil Nadu, India**,
                and you hereby consent to the personal jurisdiction and venue therein.
              </p>

              <h3 className="text-2xl font-bold text-gray-800 mb-3">8. Contact Me</h3>
              <p className="text-lg text-gray-700">
                If you have any questions about these Terms, please contact me at **[Your Email Address, e.g., developer.codecrafter@email.com]**.
              </p>
            </div>
            <button onClick={handleGoHome} className="px-6 py-2 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-gray-300">
              Back to Home
            </button>
          </div>
        )}

        {/* Blog Overview Page */}
        {page === "blog" && (
          <div className="text-center">
            <h2 className="text-4xl font-bold text-gray-800 mb-6">CodeCrafter Blog: Insights & Tips</h2>
            <div className="text-left bg-gray-50 p-8 rounded-xl shadow-lg mb-8">
              <p className="text-lg text-gray-700 mb-4">
                Welcome to the **CodeCrafter Blog**! Here, I share articles, insights, and tips
                on various programming concepts, coding best practices, and the latest trends
                in software development. My aim is to complement your quiz-taking experience
                with deeper dives into topics that matter to every aspiring and seasoned developer.
              </p>
              <p className="text-lg text-gray-700 mb-6">
                Browse through the articles below and click "Read More" to dive into the full content!
              </p>

              {/* Map through blogPosts to display summaries */}
              {blogPosts.map((post) => (
                <div key={post.id} className="mb-8 p-6 bg-white rounded-lg shadow-md border border-blue-100 flex flex-col justify-between">
                  <div>
                    <h3 className="text-3xl font-bold text-blue-800 mb-3">{post.title}</h3>
                    <p className="text-sm text-gray-500 mb-4">
                      *Posted on {post.date} by {post.author}*
                    </p>
                    <p className="text-lg text-gray-700 mb-4">
                      **{post.excerpt}**
                    </p>
                  </div>
                  <button
                    onClick={() => handleReadMore(post.id)}
                    className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-full shadow-md hover:bg-blue-700 transform hover:scale-105 transition-all duration-300 ease-in-out self-end"
                  >
                    Read More
                  </button>
                </div>
              ))}

              <div className="mt-8 p-6 bg-white rounded-lg shadow-md border border-gray-100">
                <h3 className="text-2xl font-semibold text-gray-700 mb-3">
                  More exciting programming content coming soon!
                </h3>
                <p className="text-lg text-gray-600">
                  I'm constantly working on new articles and insights to help you
                  on your coding journey. Check back soon for updates!
                </p>
              </div>

            </div>
            <button onClick={handleGoHome} className="px-6 py-2 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-gray-300">
              Back to Home
            </button>
          </div>
        )}

        {/* Single Blog Post Page */}
        {page === "blogPost" && selectedBlogPost && (
          <div className="text-center">
            <h2 className="text-4xl font-bold text-gray-800 mb-6">{selectedBlogPost.title}</h2>
            <div className="text-left bg-gray-50 p-8 rounded-xl shadow-lg mb-8">
              <p className="text-sm text-gray-500 mb-6">
                *Posted on {selectedBlogPost.date} by {selectedBlogPost.author}*
              </p>
              {/* Using dangerouslySetInnerHTML to render HTML content */}
              <div
                className="prose prose-lg max-w-none text-gray-700" // Tailwind Typography classes for better markdown rendering
                dangerouslySetInnerHTML={{ __html: selectedBlogPost.fullContent }}
              />
            </div>
            <button onClick={() => setPage('blog')} className="px-6 py-2 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-gray-300">
              Back to Blog
            </button>
            <button onClick={handleGoHome} className="ml-4 px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-blue-300">
              Back to Home
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
