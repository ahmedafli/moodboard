"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Project {
  project_name: string;
  createdAt: string;
}

export default function ProjectsPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return !!localStorage.getItem('username');
    }
    return false;
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [actionMessage, setActionMessage] = useState<string>("");
  const [deletingProject, setDeletingProject] = useState<string | null>(null);
  const router = useRouter();

  // Check login state and redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  // Load projects from webhook
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadProjects = async () => {
      const username = localStorage.getItem('username');
      if (!username) {
        setError('Username not found. Please log in again.');
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const webhookUrl = process.env.NEXT_PUBLIC_LOAD_PROJECTS_WEBHOOK_URL;
        if (!webhookUrl) {
          throw new Error('NEXT_PUBLIC_LOAD_PROJECTS_WEBHOOK_URL is not configured');
        }
        
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({ username }),
        });

        if (!res.ok) {
          throw new Error('Failed to load projects');
        }

        const data = await res.json();
        
        // Handle both array and object responses
        if (Array.isArray(data)) {
          setProjects(data);
        } else if (data.projects && Array.isArray(data.projects)) {
          setProjects(data.projects);
        } else {
          setProjects([]);
        }
      } catch (e: any) {
        console.error('Error loading projects:', e);
        setError(e?.message || 'Failed to load projects');
      } finally {
        setIsLoading(false);
      }
    };

    loadProjects();
  }, [isAuthenticated]);

  const handleOpen = (projectName: string) => {
    // Just navigate - the project page will load the data
    router.push(`/projects/${encodeURIComponent(projectName)}`);
  };

  const handleDelete = async (projectName: string) => {
    if (!confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`)) {
      return;
    }

    const username = localStorage.getItem('username');
    if (!username) {
      setError('Username not found. Please log in again.');
      return;
    }

    setDeletingProject(projectName);

    try {
      const res = await fetch('/api/projects/delete', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, project_name: projectName }),
      });

      const payload = await res.json();

      if (!res.ok || payload?.success === false) {
        const message = payload?.error || 'Failed to delete project';
        throw new Error(message);
      }

      setProjects(prev => prev.filter(p => p.project_name !== projectName));
      setActionMessage(`Project "${projectName}" deleted successfully.`);
      setTimeout(() => setActionMessage(""), 3000);
    } catch (e: any) {
      console.error('Error deleting project:', e);
      setError(e?.message || 'Failed to delete project');
    } finally {
      setDeletingProject(null);
    }
  };

  // Don't render page content if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 sm:px-0 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
              <p className="text-gray-600 mt-1">Your saved moodboard projects</p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          {actionMessage && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-700">{actionMessage}</p>
            </div>
          )}

          {isLoading ? (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12">
              <div className="flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <p className="mt-4 text-gray-600">Loading projects...</p>
              </div>
            </div>
          ) : projects.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12">
              <p className="text-gray-500 text-center">No projects yet. Create and save a moodboard to see it here.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Project Name
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created At
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {projects.map((project, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{project.project_name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{project.createdAt}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpen(project.project_name)}
                              className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                            >
                              Open
                            </button>
                            <button
                              onClick={() => handleDelete(project.project_name)}
                              disabled={deletingProject === project.project_name}
                              className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {deletingProject === project.project_name ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

