import React from 'react';
import { useNavigate } from 'react-router-dom';

const Logo: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      title="Cinepeace"
      onClick={() => navigate('/')}
      className="cursor-pointer text-white text-2xl md:text-3xl font-semibold tracking-wide"
    >
      Cinepeace
    </div>
  );
};

export default Logo;
