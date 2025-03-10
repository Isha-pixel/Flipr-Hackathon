import express from "express";
import cors from "cors";
import NewsAPI from "newsapi";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as cheerio from "cheerio"; // Updated for ES module import
import fetch from "node-fetch"; // Required for node-fetch v3
import axios from "axios"; // Updated to ES module import

const app = express();
const port = 5001;

app.use(cors({
  origin: ['http://localhost:3000', 'https://indian-news-summary.netlify.app'],
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

/*
 * Inline Scraping Function
 * (Replaces `fetch` with `axios` but keeps old code commented out)
 */
async function scrapeNewsContent(url) {
  try {
    console.log("Scraping URL:", url);
    

    // New axios code:
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive'
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const content = $('article').text().trim();

    if (!content) {
      console.log('No content found with article selector');
      // Fallback selectors for BBC news
      const fallbackContent =
        $('.article__body-content').text().trim() ||
        $('.story-body').text().trim();
      return fallbackContent;
    }

    console.log('Scraped content:', content);
    return content;
  } catch (error) {
    console.error('Scraping Error:', url, error);
    return null;
  }
}

/*
 * NewsAPI Fallback Setup
 * (We'll replace `fetch` with `axios` but keep old lines)
 */
const newsApiKeys = [
  "12f36fbf62a74407b680f9cc322dfe06",
  "7f66387075b84241b99cf1c8679ecbab",
  "ab8df099af1a4b90aec7e1fd523a2319",
  "ae058c119aa647bfa0b27b5d872d98eb",
  "717702c6ceda43478a67caad44dcc89b"
];

let currentNewsApiIndex =0;
function getNewsApiKey() {
  return newsApiKeys[currentNewsApiIndex];
}

/*
 * Helper function for NewsAPI fallback
 * (Replaces fetch calls with axios but keeps old code commented out)
 */
async function fetchNewsWithFallback(url) {
  for (let i = 0; i < newsApiKeys.length; i++) {
    try {
      // Old fetch code (commented out):
      /*
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`NewsAPI key ${getNewsApiKey()} failed with HTTP ${response.status}`);
      }
      return await response.json();
      */

      // New axios code:
      const response = await axios.get(url);
      if (response.status !== 200) {
        throw new Error(`NewsAPI key ${getNewsApiKey()} failed with HTTP ${response.status}`);
      }
      return response.data;

    } catch (error) {
      console.warn(error.message, "Trying another NewsAPI key...");
      currentNewsApiIndex = (currentNewsApiIndex + 1) % newsApiKeys.length;
    }
  }
  throw new Error("All NewsAPI keys failed.");
}

/*
 * Gemini Fallback Setup (unchanged)
 */

// Initialize Gemini with the current key
let currentGeminiIndex = 0;

const geminiKeys = [
  "AIzaSyBEnXL5Cqo-vXhQMSriRvt0HWsjHNUpS1c",
  "AIzaSyA-aKbT-UsYnl5qGNDIs-ByvSRwaPAuWWA",
  "AIzaSyCY0VD7dGr4TE92gq62zAaXNDH8zr-UgSs",
  "AIzaSyCY0VD7dGr4TE92gq62zAaXNDH8zr-UgSs",
  "AIzaSyBc_h-7OY97_Fvkw9L0jSttofstah5c9Xc",
  "AIzaSyD7Ftzy5T4kFRJGX1d88CQo0PaHOmVLH6A",
  "AIzaSyCA1KieXJxkYvxbeOZGKF6kD9KQr2XKnC4",
  "AIzaSyBUV8rZ_pNuHp9zc10TWee7hU8CRQwvadc",
  "AIzaSyAD0VfXgVdMbJq6BQUY-mMCchNkIiHVxRQ"
];

// Add delay between API calls
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to initialize Gemini API with the current key
function getGeminiInstance() {
  const genAI = new GoogleGenerativeAI(geminiKeys[currentGeminiIndex]);
  return genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
}

// Function to generate content using Gemini with key fallback
async function generateContentWithFallback(prompt) {
  const initialIndex = currentGeminiIndex; // Remember where we started
  let attempts = 0;

  while (attempts < geminiKeys.length) {
    try {
      const model = getGeminiInstance();
      const result = await model.generateContent(prompt);
      
      // Extract the text from the result
      const response = result.response;
      const text = response.text();
      
      return text; // Return the actual text content
      
    } catch (error) {
      console.warn(`❌ Gemini key ${geminiKeys[currentGeminiIndex]} failed: ${error.message}`);
      
      // If we hit rate limit, add a delay
      if (error.message.includes('429') || error.message.includes('quota')) {
        await delay(1000); // Wait 1 second before trying next key
      }
      
      // Move to next key
      currentGeminiIndex = (currentGeminiIndex + 1) % geminiKeys.length;
      attempts++;

      // If we've tried all keys, wait longer before starting over
      if (currentGeminiIndex === initialIndex) {
        await delay(2000); // Wait 2 seconds before cycling through keys again
      }
    }
  }
  throw new Error("All Gemini API keys failed after multiple attempts");
}

async function summarizeNews(news, searchQuery) {
  if (!news || !news.content) return null;

  console.log("📌 News to be summarized:", news.content);

  // Define a map of states to cities
  const stateToCities = {
    "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Tirupati"],
    "Arunachal Pradesh": ["Itanagar", "Tawang", "Ziro", "Pasighat"],
    "Assam": ["Guwahati", "Dibrugarh", "Silchar", "Jorhat"],
    "Bihar": ["Patna", "Gaya", "Muzaffarpur", "Bhagalpur"],
    "Chhattisgarh": ["Raipur", "Bhilai", "Bilaspur", "Korba"],
    "Goa": ["Panaji", "Margao", "Vasco da Gama", "Mapusa"],
    "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot"],
    "Haryana": ["Chandigarh", "Faridabad", "Gurgaon", "Panipat"],
    "Himachal Pradesh": ["Shimla", "Manali", "Dharamshala", "Kullu"],
    "Jharkhand": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro"],
    "Karnataka": ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi"],
    "Kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur"],
    "Madhya Pradesh": ["Bhopal", "Indore", "Gwalior", "Jabalpur"],
    "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik"],
    "Manipur": ["Imphal", "Thoubal", "Bishnupur", "Ukhrul"],
    "Meghalaya": ["Shillong", "Tura", "Nongstoin", "Jowai"],
    "Mizoram": ["Aizawl", "Lunglei", "Champhai", "Serchhip"],
    "Nagaland": ["Kohima", "Dimapur", "Mokokchung", "Zunheboto"],
    "Odisha": ["Bhubaneswar", "Cuttack", "Rourkela", "Puri"],
    "Punjab": ["Amritsar", "Ludhiana", "Jalandhar", "Patiala"],
    "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota"],
    "Sikkim": ["Gangtok", "Namchi", "Gyalshing", "Mangan"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli"],
    "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar"],
    "Tripura": ["Agartala", "Udaipur", "Dharmanagar", "Kailashahar"],
    "Uttar Pradesh": ["Lucknow", "Kanpur", "Varanasi", "Agra"],
    "Uttarakhand": ["Dehradun", "Haridwar", "Nainital", "Rishikesh"],
    "West Bengal": ["Kolkata", "Howrah", "Durgapur", "Siliguri"]
  };

  // Function to get a random city from the given state
  function getRandomCity(state) {
    const cities = stateToCities[state];
    return cities ? cities[Math.floor(Math.random() * cities.length)] : state;
  }

  try {
    const prompt = `Summarize the following Indian news article in under 100 words:
    Title: ${news.title}
    Author: ${news.author}
    Content: ${news.content}
    Search Query (State): ${searchQuery}

    Instructions:
    1. Summarize the news content in under 100 words.
    2. Fetch the city from the news.
    3. Give the city in the location field.

    Output the result as JSON in exactly this format (no markdown, no code blocks):
    {
      "summary": "Summarized news content in under 100 words",
      "topic": "City - News Category",
      "location": "City",
      "isRelevant": true/false,
      "citiesFound": ["list of cities from the queried state"]
    }`;

    const responseText = await generateContentWithFallback(prompt);

    // Clean the response text by removing markdown code blocks if present
    let cleanJson = responseText;
    if (responseText.includes('```')) {
      cleanJson = responseText.replace(/```json\n|```\n|```json|```/g, '').trim();
    }

    console.log("Cleaned JSON before parsing:", cleanJson);

    const parsedResponse = JSON.parse(cleanJson);

    // If the summary is missing or not marked as relevant, fallback to original content
    if (!parsedResponse.summary || !parsedResponse.isRelevant) {
      console.error("❌ Invalid summary result:", parsedResponse);
      const fallbackSummary = news.content ? news.content.split(" ").slice(0, 100).join(" ") : "Summary not available";
      return {
        ...news,
        summary: fallbackSummary,
        topic: news.title,
        location: getRandomCity(searchQuery),
        isRelevant: true,
        citiesFound: []
      };
    }

    console.log("✅ News summarized successfully:", parsedResponse.summary);
    return {
      ...news,
      summary: parsedResponse.summary,
      topic: parsedResponse.topic,
      location: getRandomCity(searchQuery),
      citiesFound: parsedResponse.citiesFound || []
    };
  } catch (error) {
    console.error("❌ Summarization error:", error);
    const fallbackSummary = news.content ? news.content.split(" ").slice(0, 100).join(" ") : "Summary not available";
    return {
      ...news,
      summary: fallbackSummary,
      topic: news.title,
      location: getRandomCity(searchQuery),
      isRelevant: true,
      citiesFound: []
    };
  }
}

/*
 * NEW ENDPOINT: /fetch-global-news
 */
app.post('/fetch-global-news', async (req, res) => {
  try {
    console.log(getNewsApiKey());

    // Using the fallback with axios inside fetchNewsWithFallback
    const url = `https://newsapi.org/v2/everything?q=India&language=en&sortBy=publishedAt&apiKey=${getNewsApiKey()}`
    const data = await fetchNewsWithFallback(url);
    res.json({ articles: data.articles || [] });
  } catch (error) {
    console.error('❌ Error fetching global news:', error);
    res.status(500).json({ error: 'Failed to fetch global news' });
  }
});

/*
 * NEW ENDPOINT: /fetch-news
 */
app.post('/fetch-news', async (req, res) => {
  const { query } = req.body;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  try {
    const encodedQuery = encodeURIComponent(query.trim());
    const url = `https://newsapi.org/v2/everything?q=${encodedQuery}&pageSize=20&apiKey=${getNewsApiKey()}`;
    const data = await fetchNewsWithFallback(url);
    res.json({ articles: data.articles || [] });
  } catch (error) {
    console.error('❌ Error fetching search news:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

/*
 * EXISTING ENDPOINT: /summarize-news
 * Summarizes articles using Gemini fallback & scraping
 */
app.post('/summarize-news', async (req, res) => {
  const { articles, query } = req.body;
  console.log('Request Body:', { query, articleCount: articles.length });
  
  const targetCount = 5; // Target number of summarized articles
  let processedArticles = 0;
  let validSummarizedArticles = [];

  try {
    // Process articles in batches until we get enough valid summaries
    while (validSummarizedArticles.length < targetCount && processedArticles < articles.length) {
      const nextBatch = articles.slice(processedArticles, processedArticles + 3);
      processedArticles += nextBatch.length;

      console.log(`Processing batch of ${nextBatch.length} articles...`);

      const summarizedBatch = await Promise.all(
        nextBatch.map(async (article) => {
          const content = await scrapeNewsContent(article.url);
          if (content) {
            console.log('Scraped content for:', article.title);
            const summarizedArticle = await summarizeNews({ ...article, content }, query);
            return summarizedArticle;
          }
          return null;
        })
      );

      const validBatch = summarizedBatch.filter((art) => art !== null);
      validSummarizedArticles = [...validSummarizedArticles, ...validBatch];

      console.log(`Got ${validSummarizedArticles.length} valid summaries out of ${targetCount} target`);
      
      if (processedArticles >= articles.length) {
        console.log('Processed all available articles');
        break;
      }
    }

    console.log(`Returning ${validSummarizedArticles.length} summarized articles`);
    res.json(validSummarizedArticles.slice(0, targetCount));
  } catch (error) {
    console.error('❌ Main Error:', error);
    res.status(500).json({ error: 'Failed to summarize news' });
  }
});

/*
 * START THE SERVER
 */
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
