import { AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // Import Card components

const ContentRemoval = () => {
  return (
    <AnimatePresence mode="wait">
      <div className="container mx-auto p-4 flex justify-center"> {/* Centering container */}
        <Card className="w-full max-w-4xl glass"> {/* Apply Card and glass effect */}
          <CardHeader>
            <CardTitle className="text-3xl font-bold">Content Removal</CardTitle> {/* Use CardTitle */}
          </CardHeader>
          <CardContent className="prose prose-invert"> {/* Apply prose to content */}

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-6">
              <h2 className="text-xl font-semibold text-white mb-2">Educational Project Notice</h2>
              <p className="text-white/80">
                This is an educational demonstration project. We do not host or store any media content. 
                All content removal requests should be directed to the appropriate content owners or hosting services.
              </p>
            </div>

            <h2 className="text-2xl font-semibold mb-3">Understanding Our Role</h2>
            <p className="mb-4">
              As an educational frontend demonstration:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>We do not host any media content</li>
              <li>Content is displayed through third-party APIs</li>
              <li>We have no control over the content provided by these services</li>
              <li>This project is for educational purposes only</li>
            </ul>

            <h2 className="text-2xl font-semibold mb-3">How to Remove Content</h2>
            <p className="mb-4">
              If you wish to have content removed:
            </p>
            <ol className="list-decimal pl-6 mb-4">
              <li>Identify the specific content in question</li>
              <li>Determine which third-party service is hosting the content</li>
              <li>Contact the appropriate content host or owner directly</li>
              <li>Follow their content removal procedures</li>
            </ol>

            <h2 className="text-2xl font-semibold mb-3">Third-Party Services</h2>
            <p className="mb-4">
              Content removal requests should be directed to the respective content owners or hosting services. 
              We cannot process content removal requests as we do not host or control any media content.
            </p>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-6">
              <h3 className="text-xl font-semibold text-white mb-2">Important Note</h3>
              <p className="text-white/80">
                This application may be discontinued at any time as it exists solely for educational and demonstration purposes. 
                We are not responsible for any content displayed through third-party APIs.
              </p>
            </div>

            <h2 className="text-2xl font-semibold mb-3">Contact</h2>
            <p className="mb-4">
              For questions about this educational demonstration, contact:
              <br />
              Email: support@flickystream.co (for demonstration purposes only)
            </p>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mt-6">
              <p className="text-white/80">
                Last updated: March 26, 2025
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AnimatePresence>
  );
};

export default ContentRemoval;
