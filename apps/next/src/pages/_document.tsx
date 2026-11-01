import { Head, Html, Main, NextScript } from "next/document";

import { openSans, outfit, theme } from "@quenti/lib/chakra-theme";

import { ColorModeScript } from "@chakra-ui/react";

const Document = () => {
  return (
    <Html>
      <Head>
        {/* Fonts loaded directly (see packages/lib/chakra-theme.ts note):
            next/font/google breaks this app's Vercel production build. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#4b83ff" />
        <meta name="msapplication-TileColor" content="#2d89ef" />
        <meta name="theme-color" content="#ffffff" />
      </Head>
      <body
        className={`overflow-x-hidden bg-gray-50 dark:bg-gray-900 ${outfit.variable} ${openSans.variable}`}
      >
        <ColorModeScript initialColorMode={theme.config.initialColorMode} />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
};

export default Document;
