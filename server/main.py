import os
from typing import TypedDict
import asyncio

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from langchain.chat_models import init_chat_model
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from dotenv import load_dotenv

# Load env variables from .env file
load_dotenv()

os.environ["OPENAI_API_KEY"] = os.getenv("LLM_API_KEY")

# FastAPI setup
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define LangGraph state schema
class AgentState(TypedDict):
    messages: list

# Memory & LLM setup
memory = MemorySaver()
llm = init_chat_model("openai:gpt-4o", streaming=True)

# Node: LLM agent with streaming
def call_agent(state: AgentState) -> dict:
    messages = state["messages"]
    response = llm.invoke(messages)
    
    # Add assistant message to the conversation
    updated_messages = messages + [{"role": "assistant", "content": response.content}]
    
    return {
        "messages": updated_messages,
        "response_content": response.content  # Add this for streaming
    }

# Build LangGraph flow
workflow = StateGraph(AgentState)
workflow.add_node("agent", call_agent)
workflow.set_entry_point("agent")
workflow.add_edge("agent", END)

# Compile with checkpointer for automatic memory
graph = workflow.compile(checkpointer=memory)

@app.websocket("/ws/{thread_id}")
async def chat_ws(websocket: WebSocket, thread_id: str):
    await websocket.accept()
    print(f"WebSocket connected for thread: {thread_id}")

    while True:
        try:
            user_message = await websocket.receive_text()
            print(f"Received message: {user_message}")
            
            # Configuration for this thread
            config = {"configurable": {"thread_id": thread_id}}
            
            # Get current state to retrieve message history
            current_state = graph.get_state(config)
            
            # Extract existing messages or start fresh
            if current_state and current_state.values and "messages" in current_state.values:
                existing_messages = current_state.values["messages"]
            else:
                existing_messages = []
            
            # Add user message
            messages = existing_messages + [{"role": "user", "content": user_message}]
            
            inputs = {"messages": messages}
            
            # Get the response from the graph
            result = graph.invoke(inputs, config=config)
            
            # Get the assistant's response
            if "messages" in result and len(result["messages"]) > 0:
                assistant_message = result["messages"][-1]
                if assistant_message.get("role") == "assistant":
                    response_text = assistant_message.get("content", "")
                    
                    # Simulate streaming by sending chunks
                    words = response_text.split(" ")
                    for i, word in enumerate(words):
                        if i == 0:
                            await websocket.send_text(word)
                        else:
                            await websocket.send_text(" " + word)
                        await asyncio.sleep(0.05)  # Small delay for streaming effect
            
            await websocket.send_text("[END]")
            print("Response sent successfully")

        except Exception as e:
            print(f"ERROR: {e}")
            print(f"Error type: {type(e)}")
            import traceback
            traceback.print_exc()
            await websocket.close()
            break
