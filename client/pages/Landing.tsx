// @/pages/Landing.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { BarChart3, Users, FileText, TrendingUp, GraduationCap, Settings, Sparkles } from 'lucide-react';

export default function Landing() {
  const [displayText, setDisplayText] = useState('');
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTypingComplete, setIsTypingComplete] = useState(false);

  const phrases = [
    'KalaboBoarding',
    'planting for future harvest',
    'enjoy your time'
  ];

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const currentPhrase = phrases[currentPhraseIndex];
    
    if (!isDeleting && displayText === currentPhrase) {
      // Wait 2 seconds before starting to delete
      timeout = setTimeout(() => {
        setIsDeleting(true);
      }, 2000);
      return () => clearTimeout(timeout);
    }
    
    if (isDeleting && displayText === '') {
      setIsDeleting(false);
      setCurrentPhraseIndex((prev) => (prev + 1) % phrases.length);
      return;
    }
    
    const speed = isDeleting ? 50 : 100;
    const nextText = isDeleting
      ? currentPhrase.substring(0, displayText.length - 1)
      : currentPhrase.substring(0, displayText.length + 1);
    
    timeout = setTimeout(() => {
      setDisplayText(nextText);
    }, speed);
    
    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, currentPhraseIndex]);

  // Animation styles
  const animationStyles = `
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    @keyframes slideInLeft {
      from {
        opacity: 0;
        transform: translateX(-50px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @keyframes cursorBlink {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0;
      }
    }

    .animate-fadeInUp {
      animation: fadeInUp 0.8s ease-out forwards;
    }
    
    .animate-fadeIn {
      animation: fadeIn 0.5s ease-out forwards;
    }
    
    .animate-slideInLeft {
      animation: slideInLeft 0.8s ease-out forwards;
    }
    
    .animation-delay-100 {
      animation-delay: 0.1s;
    }
    
    .animation-delay-200 {
      animation-delay: 0.2s;
    }
    
    .animation-delay-300 {
      animation-delay: 0.3s;
    }
    
    .animation-delay-400 {
      animation-delay: 0.4s;
    }
    
    .typing-cursor::after {
      content: '|';
      animation: cursorBlink 1s infinite;
      margin-left: 2px;
      color: #3b82f6;
    }
  `;

  return (
    <>
      <style>{animationStyles}</style>
      <Layout className="flex flex-col">
        {/* Hero Section - Split Layout with Person Image */}
        <section className="relative w-full min-h-screen overflow-hidden">
          {/* Background Image with Right Alignment */}
          <div 
            className="absolute inset-0 bg-cover bg-no-repeat"
            style={{
              backgroundImage: 'url("/images/landingpage-bg.jpg")',
              backgroundPosition: 'center right',
              backgroundSize: 'cover'
            }}
          />
          
          {/* Gradient Overlay - Left side fade for text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-transparent" />
          
          {/* Content */}
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-screen flex items-center">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center w-full py-20">
              
              {/* LEFT SIDE - Text Content */}
              <div className="space-y-8 animate-slideInLeft">
                {/* Logo Badge */}
                <div className="inline-flex items-center gap-2 bg-blue-50/80 backdrop-blur-sm px-4 py-2 rounded-full border border-blue-200 animate-fadeIn">
                  <span className="text-sm font-medium text-blue-700">Empowering Education</span>
                </div>
                
                {/* Main Heading with Typing Animation */}
                <div className="space-y-4">
                  <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 leading-tight">
                    Welcome to{' '}
                    <span className="inline-block">
                      <span className="text-blue-600 typing-cursor">
                        {displayText}
                      </span>
                    </span>
                  </h1>
                  
                  <p className="text-lg sm:text-xl text-gray-700 max-w-lg leading-relaxed">
                    A comprehensive Results Entry and Distribution System designed to simplify academic management for teachers and administrators.
                  </p>
                </div>
                
                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <Link
                    to="/signup"
                    className="px-8 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 text-center group"
                  >
                    <span className="flex items-center justify-center gap-2">
                      Create Account
                      <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </span>
                  </Link>
                  <Link
                    to="/signin"
                    className="px-8 py-4 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:border-blue-600 hover:bg-blue-50 transition-all duration-300 text-center"
                  >
                    Sign In
                  </Link>
                </div>
                
                {/* Stats or Trust Badge */}
                <div className="flex items-center gap-6 pt-4 animate-fadeIn animation-delay-400">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                    </div>
                  </div>
                </div>
              </div>
              
              {/* RIGHT SIDE - Empty (image shows through) */}
              <div className="hidden lg:block" />
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="w-full py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                Powerful Features
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Everything you need to manage results, track performance, and generate comprehensive reports
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {/* Feature 1 */}
              <div className="group p-6 sm:p-8 bg-white rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                  <FileText className="text-blue-600" size={24} />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Results Entry</h3>
                <p className="text-gray-600 leading-relaxed">
                  Teachers can easily input student grades with an intuitive interface. Track results by subject and class.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="group p-6 sm:p-8 bg-white rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                  <TrendingUp className="text-blue-600" size={24} />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Results Analysis</h3>
                <p className="text-gray-600 leading-relaxed">
                  Visualize grade distributions and performance trends with interactive charts and detailed analytics.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="group p-6 sm:p-8 bg-white rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                  <FileText className="text-blue-600" size={24} />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Report Cards</h3>
                <p className="text-gray-600 leading-relaxed">
                  Generate and download professional report cards. Support for bulk downloads and email distribution.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="group p-6 sm:p-8 bg-white rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                  <Users className="text-blue-600" size={24} />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Class Management</h3>
                <p className="text-gray-600 leading-relaxed">
                  Create classes and manage student enrollment. Assign teachers to classes with ease.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="group p-6 sm:p-8 bg-white rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                  <Users className="text-blue-600" size={24} />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Teacher Management</h3>
                <p className="text-gray-600 leading-relaxed">
                  Register teachers and assign them to classes and subjects they teach.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="group p-6 sm:p-8 bg-white rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                  <BarChart3 className="text-blue-600" size={24} />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Analytics Dashboard</h3>
                <p className="text-gray-600 leading-relaxed">
                  Monitor school performance with comprehensive dashboards showing key metrics and trends.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* User Types Section */}
        <section className="w-full py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                Tailored for Your Role
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Whether you're an administrator or teacher, get access to the tools you need
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Admin Card */}
              <div className="p-8 bg-gradient-to-br from-blue-50 to-white rounded-2xl border-2 border-blue-200 shadow-lg hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                    <Settings className="text-white" size={24} />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">Administrator</h3>
                </div>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-3">
                    <span className="text-blue-600 font-bold mt-1">✓</span>
                    <span className="text-gray-700">View school dashboard with key metrics</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-blue-600 font-bold mt-1">✓</span>
                    <span className="text-gray-700">Manage classes and student enrollment</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-blue-600 font-bold mt-1">✓</span>
                    <span className="text-gray-700">Manage teachers and subject assignments</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-blue-600 font-bold mt-1">✓</span>
                    <span className="text-gray-700">Generate report cards</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-blue-600 font-bold mt-1">✓</span>
                    <span className="text-gray-700">Analyze results and performance trends</span>
                  </li>
                </ul>
                <Link
                  to="/signup?type=admin"
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors text-center block"
                >
                  Create Admin Account
                </Link>
              </div>

              {/* Teacher Card */}
              <div className="p-8 bg-gradient-to-br from-gray-50 to-white rounded-2xl border-2 border-gray-200 shadow-lg hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-gray-600 rounded-lg flex items-center justify-center">
                    <GraduationCap className="text-white" size={24} />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">Teacher</h3>
                </div>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-3">
                    <span className="text-gray-600 font-bold mt-1">✓</span>
                    <span className="text-gray-700">Access teacher dashboard</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-gray-600 font-bold mt-1">✓</span>
                    <span className="text-gray-700">Track student attendance</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-gray-600 font-bold mt-1">✓</span>
                    <span className="text-gray-700">Enter student results and grades</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-gray-600 font-bold mt-1">✓</span>
                    <span className="text-gray-700">Analyze class performance</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-gray-600 font-bold mt-1">✓</span>
                    <span className="text-gray-700">View detailed analytics</span>
                  </li>
                </ul>
                <Link
                  to="/signup?type=teacher"
                  className="w-full py-3 border-2 border-gray-600 text-gray-900 rounded-lg font-semibold hover:bg-gray-100 transition-colors text-center block"
                >
                  Create Teacher Account
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="w-full py-16 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white">
              Ready to transform academic management?
            </h2>
            <p className="text-lg text-blue-100 max-w-2xl mx-auto">
              Join thousands of educators using KalaboBoarding-SRS
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link
                to="/signup"
                className="px-8 py-3.5 bg-white text-blue-600 rounded-xl font-semibold hover:bg-gray-100 transition-all duration-300 shadow-lg hover:shadow-xl text-center"
              >
                Get Started Now
              </Link>
              <Link
                to="/signin"
                className="px-8 py-3.5 border-2 border-white text-white rounded-xl font-semibold hover:bg-white/10 transition-colors duration-300 text-center"
              >
                Sign In
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="w-full py-8 px-4 sm:px-6 lg:px-8 bg-gray-900 text-gray-400 text-center border-t border-gray-800">
          <p>&copy; 2026 KalaboBoarding-SRS. All rights reserved.</p>
        </footer>
      </Layout>
    </>
  );
}