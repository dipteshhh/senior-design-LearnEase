import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-2xl p-8 bg-white rounded-xl shadow">
        <h1 className="text-3xl font-bold mb-4 text-gray-900">
          LearnEase
        </h1>

        <p className="text-gray-600 mb-6">
          LearnEase helps students understand educational content by
          restructuring it into clear, accessible formats — without
          generating final answers.
        </p>

        <Link href="/workspace">
          <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Get Started
          </button>
        </Link>
      </div>
    </main>
  );
}
