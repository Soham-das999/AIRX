import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import Login from './Login.jsx'
import Airfare from './Airfare.jsx'
import './index.css'

function Root() {
  const [user, setUser] = useState(null)

  if (!user) {
    return <Login onLogin={(u) => setUser(u)} />
  }
  return <Airfare />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)