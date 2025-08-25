import React from 'react';
import { useNavigate } from 'react-router-dom';

const Logo: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      title="Flickystream"
      onClick={() => navigate('/')}
      className="cursor-pointer text-white text-2xl md:text-3xl font-semibold tracking-wide"
    >
      Flickystream
    </div>
  );
};

export default Logo;
