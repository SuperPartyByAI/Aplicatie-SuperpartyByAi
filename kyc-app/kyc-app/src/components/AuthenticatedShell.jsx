import { useLocation } from 'react-router-dom';
import Dock from './Dock';
import GridOverlay from './GridOverlay';

// Routes where UI Shell should NOT be rendered
const EXCLUDED_ROUTES = [
  '/',
  '/verify-email',
  '/kyc',
  '/waiting',
  '/staff-setup',
];

export default function AuthenticatedShell() {
  const location = useLocation();
  
  // Don't render UI Shell on auth/setup routes
  if (EXCLUDED_ROUTES.includes(location.pathname)) {
    return null;
  }
  
  return (
    <>
      <Dock />
      <GridOverlay />
    </>
  );
}
