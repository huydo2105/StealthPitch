import os
import sys
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    print("Error: GOOGLE_API_KEY not found in environment")
    sys.exit(1)

# Initialize the GenAI Client
client = genai.Client(api_key=api_key)

try:
    print("Listing available embedding models...")
    available_models = []
    for m in client.models.list():
        # Filtering for models that support embedding
        if 'embed' in m.name:
            print(f" - {m.name}")
            available_models.append(m.name)

    print("\nTesting Embedding...")
    
    # Using the model found in your specific list
    # We'll use gemini-embedding-001 as seen in your logs
    target_model = "models/gemini-embedding-001"
    
    if target_model not in available_models:
        print(f"Warning: {target_model} not in list. Defaulting to first available: {available_models[0]}")
        target_model = available_models[0]

    response = client.models.embed_content(
        model=target_model,
        contents="Hello world"
    )

    # The SDK returns a list of embeddings in the 'embeddings' attribute
    if response.embeddings:
        # Accessing the first embedding's values
        vec = response.embeddings[0].values
        print(f"Embedding successful using {target_model}.")
        print(f"Vector length: {len(vec)}")
    else:
        print(f"Unexpected embedding response structure: {response}")

    print("\nTesting Text Generation...")
    # Standard Gemini 1.5 Flash or Pro check
    gen_response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents="Say hello in 5 words."
    )
    print(f"Generation successful: {gen_response.text}")

except Exception as e:
    print(f"Verification failed: {e}")
    sys.exit(1)