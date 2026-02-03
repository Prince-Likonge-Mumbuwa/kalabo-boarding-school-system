import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Layout } from "@/components/Layout";
import { ArrowLeft, Lightbulb } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <Layout className="flex items-center justify-center py-20 px-4">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <div className="text-6xl font-bold text-gray-900">404</div>
          <p className="text-xl text-gray-600 mt-2">Page not found</p>
        </div>

        <p className="text-gray-600 mb-8">
          The page you're looking for doesn't exist yet. This might be a feature we're building!
        </p>

        <div className="p-6 bg-blue-50 rounded-lg border border-blue-200 mb-8">
          <div className="flex items-start gap-3">
            <Lightbulb className="text-blue-600 flex-shrink-0 mt-1" size={20} />
            <p className="text-sm text-blue-700">
              If you need this page, let me know what you'd like to build and I can create it for you!
            </p>
          </div>
        </div>

        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          <ArrowLeft size={20} />
          Return to Home
        </Link>
      </div>
    </Layout>
  );
};

export default NotFound;
