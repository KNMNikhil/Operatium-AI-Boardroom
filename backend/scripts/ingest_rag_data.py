import os
import sys
import asyncio
from pathlib import Path
from dotenv import load_dotenv

# Add backend directory to sys.path so we can import app modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.document_processor import extract_text_from_file, source_slug_from_filename
from app.db.vector_store import add_documents
from app.config import GOOGLE_API_KEY
from google import genai
from google.genai import types
import requests
from bs4 import BeautifulSoup

load_dotenv()

RAG_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "rag_training_data"))

EXECUTIVES = [
    "CEO", 
    "CTO", 
    "Product Manager", 
    "Growth & Marketing", 
    "Finance & Operations", 
    "Investor & Risk Advisor",
    "all"
]

def analyze_role_for_document(text: str, filename: str) -> str:
    """Uses Gemini to determine which executive this document is best suited for."""
    client = genai.Client(api_key=GOOGLE_API_KEY, http_options=types.HttpOptions(api_version="v1"))
    
    prompt = f"""You are an intelligent classifier for a startup AI system.
We have an uploaded document named "{filename}".
Here is a preview of the content:
{text[:2500]}

Which of the following executive roles is this document BEST suited for?
Options: {', '.join(EXECUTIVES)}

If it's general startup advice that applies to everyone (like YC core principles), output "all".
Output ONLY the exact role name from the options above. Do not output any other text."""

    import time
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            role = response.text.strip().strip('"').strip("'")
            
            # Fuzzy match to ensure it's in our list
            for ex in EXECUTIVES:
                if ex.lower() in role.lower():
                    return ex
            return "all"
        except Exception as e:
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                print(f"Rate limit hit. Waiting 60 seconds before retrying (Attempt {attempt+1}/{max_retries})...")
                time.sleep(60)
            else:
                print(f"Failed to analyze role for {filename}. Defaulting to 'all'. Error: {e}")
                return "all"
    return "all"


async def process_directory():
    if not os.path.exists(RAG_DATA_DIR):
        print(f"Creating directory {RAG_DATA_DIR}...")
        os.makedirs(RAG_DATA_DIR)
        print("Directory created! Please place your PDFs, .md, .txt files, or a 'urls.txt' file inside it and run this script again.")
        return

    # Process URLs if urls.txt exists
    urls_file = os.path.join(RAG_DATA_DIR, "urls.txt")
    if os.path.exists(urls_file):
        print("Found urls.txt! Processing websites...\n")
        with open(urls_file, "r") as f:
            urls = [line.strip() for line in f if line.strip() and not line.startswith("#")]
        
        for url in urls:
            print(f"Scraping URL: '{url}'...")
            try:
                # Add headers to avoid 403 Forbidden on some sites
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
                response = requests.get(url, headers=headers, timeout=10)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, "html.parser")
                # Remove script and style elements
                for script in soup(["script", "style", "nav", "footer", "header"]):
                    script.extract()
                
                text = soup.get_text(separator="\n", strip=True)
                
                if not text.strip():
                    print(f"  -> Skipping {url}: No text extracted.")
                    continue

                print("  -> Analyzing content to determine the best executive role...")
                filename_mock = url.split("://")[-1].replace("/", "_")[:40] + ".html"
                role = analyze_role_for_document(text, filename_mock)
                print(f"  -> Assigned Role: {role}")

                source_slug = source_slug_from_filename(filename_mock)
                print(f"  -> Embedding and uploading to database...")
                
                chunks_inserted = await add_documents(
                    texts=[text],
                    role=role,
                    source=source_slug,
                    doc_type="general",
                    chunk=True
                )
                print(f"  -> Success! Inserted {chunks_inserted} chunks.\n")
            except Exception as e:
                print(f"  -> Error processing URL {url}: {e}\n")
        
        # Move urls.txt to ingested so we don't process it again
        ingested_dir = os.path.join(RAG_DATA_DIR, "ingested")
        os.makedirs(ingested_dir, exist_ok=True)
        # Append to an ingested_urls.txt instead of moving, or just rename with timestamp
        import time
        os.rename(urls_file, os.path.join(ingested_dir, f"urls_{int(time.time())}.txt"))

    # Process local files
    files = [f for f in os.listdir(RAG_DATA_DIR) if f.lower().endswith(('.pdf', '.md', '.txt')) and f != 'urls.txt']
    
    if not files:
        print(f"No valid documents found in {RAG_DATA_DIR}. Please add PDFs, .md, or .txt files.")
        return

    print(f"Found {len(files)} files to process in {RAG_DATA_DIR}...\n")

    for filename in files:
        filepath = os.path.join(RAG_DATA_DIR, filename)
        print(f"Processing '{filename}'...")
        
        with open(filepath, "rb") as f:
            file_bytes = f.read()

        try:
            # 1. Extract text
            text = extract_text_from_file(file_bytes, filename)
            if not text.strip():
                print(f"  -> Skipping {filename}: No text extracted.")
                continue

            # 2. Determine Executive Role
            print("  -> Analyzing content to determine the best executive role...")
            role = analyze_role_for_document(text, filename)
            print(f"  -> Assigned Role: {role}")

            # 3. Store in Vector Database
            source_slug = source_slug_from_filename(filename)
            print(f"  -> Embedding and uploading to database...")
            
            chunks_inserted = await add_documents(
                texts=[text],
                role=role,
                source=source_slug,
                doc_type="general",
                chunk=True
            )
            print(f"  -> Success! Inserted {chunks_inserted} chunks.\n")
            
            # Optional: Move the file to an 'ingested' folder so it doesn't get processed twice
            ingested_dir = os.path.join(RAG_DATA_DIR, "ingested")
            os.makedirs(ingested_dir, exist_ok=True)
            os.rename(filepath, os.path.join(ingested_dir, filename))

        except Exception as e:
            print(f"  -> Error processing {filename}: {e}\n")

    print("All processing complete! Your executives have been trained with the new data.")

if __name__ == "__main__":
    asyncio.run(process_directory())
