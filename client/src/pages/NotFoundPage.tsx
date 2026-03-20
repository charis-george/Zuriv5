import { Link } from 'react-router-dom'

function NotFoundPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-zuri-black flex flex-col items-center justify-center px-4">
      <p className="text-white text-6xl md:text-7xl font-light tracking-tight mb-4">404</p>
      <p className="text-white font-medium text-lg mb-1">Whoops!</p>
      <p className="text-gray-400 text-sm mb-10">We couldn’t find the page you were looking for.</p>
      <Link to="/" className="inline-flex items-center justify-center bg-transparent text-white text-[13px] font-semibold leading-none rounded-lg px-5 py-2.5 border border-zuri-orange hover:bg-zuri-orange hover:text-white transition-colors">
        back to home
      </Link>
    </div>
  )
}

export default NotFoundPage
