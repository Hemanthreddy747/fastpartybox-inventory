import React, { useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../firebase/firebase"; // Adjust the path as necessary
import { useNavigate } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./login.css";
import logo from "../assets/images/company-logo.jpg"; // Adjust the path as necessary
import googlelogo from "../assets/images/googlelogo.svg"; // Adjust the path as necessary
import LoaderC from "../utills/loaderC";
import { BiRefresh } from "react-icons/bi";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formType, setFormType] = useState("login"); // 'login', 'signup', 'forgotPassword'
  const [captchaValue, setCaptchaValue] = useState("");
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    generateCaptcha();
  }, [formType]);

  const notifyError = (message) => toast.error(message);
  const notifySuccess = (message) => toast.success(message);

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
  };

  const validatePassword = (password) => {
    return password.length >= 6;
  };

  const generateCaptcha = () => {
    // Generate a two-digit number (10-99) for num1
    let num1 = Math.floor(Math.random() * 90) + 10;
    let num2;
    const isAddition = Math.random() > 0.5;

    if (isAddition) {
      // For addition, ensure num2 is small enough that sum is single digit
      // If num1 is 78, num2 should be at most (9 - 78%10) = 1
      const maxNum2 = 9 - (num1 % 10);
      num2 = Math.floor(Math.random() * (maxNum2 + 1));
    } else {
      // For subtraction, ensure num2 makes num1-num2 a single digit
      // If num1 is 45, num2 should be 36-44 to get a single digit result
      const minNum2 = num1 - 9;
      const maxNum2 = num1 - 1;
      num2 = Math.floor(Math.random() * (maxNum2 - minNum2 + 1)) + minNum2;
    }

    const question = isAddition ? `${num1} + ${num2}` : `${num1} - ${num2}`;
    const answer = isAddition ? num1 + num2 : num1 - num2;

    setCaptchaQuestion(question);
    setCaptchaValue(answer.toString());
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!validateEmail(email)) {
      notifyError("Please enter a valid email address.");
      return;
    }

    if (!validatePassword(password)) {
      notifyError("Password must be at least 6 characters long.");
      return;
    }

    if (captchaAnswer !== captchaValue) {
      notifyError("Incorrect CAPTCHA answer.");
      return;
    }

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;
      console.log("User UID:", user.uid);
      notifySuccess("Login successful");
      navigate("/stock"); // Adjust the path as necessary
    } catch (error) {
      notifyError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    setLoading(true);
    try {
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;
      console.log("User UID:", user.uid);
      navigate("/stock");
    } catch (error) {
      notifyError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (!validateEmail(email)) {
      notifyError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      notifySuccess("Check your email for the password reset link.");
    } catch (error) {
      notifyError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();

    if (!validateEmail(email)) {
      notifyError("Please enter a valid email address.");
      return;
    }

    if (!validatePassword(password)) {
      notifyError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      notifyError("Passwords do not match.");
      return;
    }

    if (captchaAnswer !== captchaValue) {
      notifyError("Incorrect CAPTCHA answer.");
      return;
    }

    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      navigate("/billing");
    } catch (error) {
      notifyError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {loading ? (
        <LoaderC />
      ) : (
        <div className="login-container">
          <div className="container">
            <ToastContainer />

            <div className="card">
              <div className="logo-container">
                <img src={logo} alt="Company Logo" className="logo" />
                <h2 className="tagline">Billing made Faster and Easier</h2>
              </div>
              <h3 className="card-title">
                {formType === "login" && "Welcome Back"}
                {formType === "signup" && "Sign Up"}
                {formType === "forgotPassword" && "Reset Password"}
              </h3>
              {formType === "login" && (
                <form className="form" onSubmit={handleLogin}>
                  <input
                    type="email"
                    placeholder="Email"
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="input"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="input"
                  />
                  <div className="captcha">
                    <label>{captchaQuestion} = </label>
                    <div className="captcha-input-group">
                      <input
                        type="text"
                        placeholder="Answer"
                        onChange={(e) => setCaptchaAnswer(e.target.value)}
                        required
                        className="input"
                      />
                      <button
                        type="button"
                        onClick={generateCaptcha}
                        className="reload-button"
                      >
                        <BiRefresh />
                      </button>
                    </div>
                  </div>
                  <button type="submit" className="button">
                    Log In
                  </button>
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="button d-flex align-items-center justify-content-center"
                  >
                    {" "}
                    Log In with Google
                    <img
                      src={googlelogo}
                      alt="Google Logo"
                      className="google-logo-signin ms-3"
                    />
                  </button>
                </form>
              )}
              {formType === "signup" && (
                <form className="form" onSubmit={handleSignup}>
                  <input
                    type="email"
                    placeholder="Email"
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="input"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="input"
                  />
                  <input
                    type="password"
                    placeholder="Confirm Password"
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="input"
                  />
                  <div className="captcha">
                    <label className="">{captchaQuestion} = </label>
                    <div className="captcha-input-group w-50">
                      <input
                        className="input"
                        type="text"
                        placeholder="Answergg"
                        onChange={(e) => setCaptchaAnswer(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={generateCaptcha}
                        className="reload-button"
                      >
                        <BiRefresh />
                      </button>
                    </div>
                  </div>
                  <button type="submit" className="button">
                    Sign Up
                  </button>
                </form>
              )}
              {formType === "forgotPassword" && (
                <form className="form" onSubmit={handleResetPassword}>
                  <input
                    type="email"
                    placeholder="Enter your email"
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="input"
                  />
                  <button type="submit" className="button">
                    Send Reset Link
                  </button>
                </form>
              )}
              {formType === "login" && (
                <p className="text-center mt-3">
                  Don't have an account?{" "}
                  <button
                    className="link-button"
                    onClick={() => setFormType("signup")}
                  >
                    Sign Up
                  </button>
                </p>
              )}
              {formType === "login" && (
                <p className="text-center">
                  Forgot your password?{" "}
                  <button
                    className="link-button"
                    onClick={() => setFormType("forgotPassword")}
                  >
                    Reset here
                  </button>
                </p>
              )}
              {(formType === "signup" || formType === "forgotPassword") && (
                <p className="text-center mt-3">
                  <button
                    className="link-button"
                    onClick={() => setFormType("login")}
                  >
                    Back to Login
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Login;
