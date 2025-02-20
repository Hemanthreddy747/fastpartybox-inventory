import React from 'react';
import { Helmet } from 'react-helmet';
import { APP_CONFIG } from '../config/constants';

const SEO = ({ title, description, keywords, canonicalUrl }) => {
  const pageTitle = title 
    ? `${title} | ${APP_CONFIG.APP_NAME}`
    : APP_CONFIG.META.TITLE;
    
  const pageDescription = description || APP_CONFIG.META.DESCRIPTION;
  const pageKeywords = keywords || APP_CONFIG.META.KEYWORDS.join(', ');
  const canonical = canonicalUrl || `https://${APP_CONFIG.DOMAIN}${window.location.pathname}`;

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      <meta name="keywords" content={pageKeywords} />
      <link rel="canonical" href={canonical} />
      
      {/* Open Graph */}
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:url" content={canonical} />
      
      {/* Twitter */}
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDescription} />
    </Helmet>
  );
};

export default SEO;