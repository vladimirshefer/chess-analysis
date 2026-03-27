import { Routes, Route, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'

function Home() {
  const [message, setMessage] = useState('Loading...')

  useEffect(() => {
    fetch('http://localhost:3001/api/message')
      .then(res => res.json())
      .then(data => setMessage(data.message))
      .catch(() => setMessage('Error connecting to API'))
  }, [])

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
      <h1 className="text-4xl font-bold text-blue-600 mb-4">Chess Analysis App</h1>
      <p className="text-lg text-gray-700">API Message: {message}</p>
      <nav className="mt-8">
        <Link to="/about" className="text-blue-500 hover:underline">About</Link>
      </nav>
    </div>
  )
}

function About() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
      <h1 className="text-4xl font-bold text-blue-600 mb-4">About This App</h1>
      <p className="text-lg text-gray-700">This is a full-stack chess analysis application built with Vite, React, Tailwind, and Express.</p>
      <nav className="mt-8">
        <Link to="/" className="text-blue-500 hover:underline">Home</Link>
      </nav>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
    </Routes>
  )
}

export default App
