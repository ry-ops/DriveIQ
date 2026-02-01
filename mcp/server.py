#!/usr/bin/env python3
"""
DriveIQ MCP Server

Model Context Protocol server for interacting with DriveIQ vehicle management system.
Provides tools for document search, vehicle management, maintenance tracking, and reminders.
"""

import asyncio
import json
import logging
import sys
from typing import Any, Optional
from datetime import datetime

import httpx

# MCP server implementation using stdio transport
logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("driveiq-mcp")

# DriveIQ API base URL (configurable via environment)
import os
API_BASE_URL = os.getenv("DRIVEIQ_API_URL", "http://localhost:8000")
API_TOKEN = os.getenv("DRIVEIQ_API_TOKEN", "")


class DriveIQMCPServer:
    """MCP Server for DriveIQ integration."""

    def __init__(self):
        self.client = httpx.AsyncClient(
            base_url=API_BASE_URL,
            timeout=30.0,
            headers={"Authorization": f"Bearer {API_TOKEN}"} if API_TOKEN else {},
        )
        self.tools = self._define_tools()

    def _define_tools(self) -> list[dict]:
        """Define available MCP tools."""
        return [
            {
                "name": "driveiq_search",
                "description": "Search DriveIQ documents using semantic search. Returns relevant document chunks from vehicle manuals, maintenance reports, and service records.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query for finding relevant documents",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of results (default: 5)",
                            "default": 5,
                        },
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "driveiq_ask",
                "description": "Ask a question about your vehicle and get an AI-powered answer with citations from your documents. Uses RAG to provide accurate, sourced responses.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "question": {
                            "type": "string",
                            "description": "Question about your vehicle (maintenance, operation, features, etc.)",
                        },
                    },
                    "required": ["question"],
                },
            },
            {
                "name": "driveiq_get_vehicle",
                "description": "Get information about the registered vehicle including make, model, year, VIN, and current mileage.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                },
            },
            {
                "name": "driveiq_update_mileage",
                "description": "Update the current mileage of your vehicle.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "mileage": {
                            "type": "integer",
                            "description": "Current vehicle mileage",
                        },
                    },
                    "required": ["mileage"],
                },
            },
            {
                "name": "driveiq_get_maintenance",
                "description": "Get maintenance records for your vehicle. Can filter by type and date range.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "maintenance_type": {
                            "type": "string",
                            "description": "Filter by maintenance type (oil_change, tire_rotation, etc.)",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of records (default: 10)",
                            "default": 10,
                        },
                    },
                },
            },
            {
                "name": "driveiq_add_maintenance",
                "description": "Add a new maintenance record for your vehicle.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "maintenance_type": {
                            "type": "string",
                            "description": "Type of maintenance performed",
                        },
                        "description": {
                            "type": "string",
                            "description": "Description of work performed",
                        },
                        "date_performed": {
                            "type": "string",
                            "description": "Date of service (YYYY-MM-DD)",
                        },
                        "mileage": {
                            "type": "integer",
                            "description": "Mileage at time of service",
                        },
                        "cost": {
                            "type": "number",
                            "description": "Total cost of service",
                        },
                        "service_provider": {
                            "type": "string",
                            "description": "Name of service provider",
                        },
                    },
                    "required": ["maintenance_type", "description", "date_performed", "mileage"],
                },
            },
            {
                "name": "driveiq_get_reminders",
                "description": "Get upcoming service reminders for your vehicle.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "include_completed": {
                            "type": "boolean",
                            "description": "Include completed reminders (default: false)",
                            "default": False,
                        },
                    },
                },
            },
            {
                "name": "driveiq_smart_reminders",
                "description": "Get smart AI-generated service recommendations based on your maintenance history and schedule.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                },
            },
            {
                "name": "driveiq_complete_reminder",
                "description": "Mark a reminder as completed and optionally create a maintenance record.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "reminder_id": {
                            "type": "integer",
                            "description": "ID of the reminder to complete",
                        },
                        "create_maintenance": {
                            "type": "boolean",
                            "description": "Create a maintenance record (default: true)",
                            "default": True,
                        },
                        "cost": {
                            "type": "number",
                            "description": "Cost of service (if creating maintenance record)",
                        },
                        "service_provider": {
                            "type": "string",
                            "description": "Service provider name",
                        },
                    },
                    "required": ["reminder_id"],
                },
            },
            {
                "name": "driveiq_moe_ask",
                "description": "Ask a question using the Mixture of Experts system for specialized answers. Routes to the appropriate expert (maintenance, technical, safety, general).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "question": {
                            "type": "string",
                            "description": "Your question about the vehicle",
                        },
                    },
                    "required": ["question"],
                },
            },
        ]

    async def handle_tool_call(self, name: str, arguments: dict) -> dict:
        """Handle a tool call and return the result."""
        try:
            if name == "driveiq_search":
                return await self._search(arguments)
            elif name == "driveiq_ask":
                return await self._ask(arguments)
            elif name == "driveiq_get_vehicle":
                return await self._get_vehicle()
            elif name == "driveiq_update_mileage":
                return await self._update_mileage(arguments)
            elif name == "driveiq_get_maintenance":
                return await self._get_maintenance(arguments)
            elif name == "driveiq_add_maintenance":
                return await self._add_maintenance(arguments)
            elif name == "driveiq_get_reminders":
                return await self._get_reminders(arguments)
            elif name == "driveiq_smart_reminders":
                return await self._smart_reminders()
            elif name == "driveiq_complete_reminder":
                return await self._complete_reminder(arguments)
            elif name == "driveiq_moe_ask":
                return await self._moe_ask(arguments)
            else:
                return {"error": f"Unknown tool: {name}"}
        except httpx.HTTPError as e:
            logger.error(f"HTTP error calling DriveIQ API: {e}")
            return {"error": f"API error: {str(e)}"}
        except Exception as e:
            logger.error(f"Error handling tool call {name}: {e}")
            return {"error": str(e)}

    async def _search(self, args: dict) -> dict:
        """Semantic search in documents."""
        response = await self.client.post(
            "/api/search/",
            json={"query": args["query"]},
        )
        response.raise_for_status()
        results = response.json()
        return {
            "results": results[:args.get("limit", 5)],
            "total": len(results),
        }

    async def _ask(self, args: dict) -> dict:
        """RAG-powered question answering."""
        response = await self.client.post(
            "/api/search/ask",
            json={"query": args["question"]},
        )
        response.raise_for_status()
        return response.json()

    async def _get_vehicle(self) -> dict:
        """Get vehicle information."""
        response = await self.client.get("/api/vehicle/")
        response.raise_for_status()
        return response.json()

    async def _update_mileage(self, args: dict) -> dict:
        """Update vehicle mileage."""
        response = await self.client.patch(
            f"/api/vehicle/mileage/{args['mileage']}"
        )
        response.raise_for_status()
        return response.json()

    async def _get_maintenance(self, args: dict) -> dict:
        """Get maintenance records."""
        params = {"limit": args.get("limit", 10)}
        if "maintenance_type" in args:
            params["maintenance_type"] = args["maintenance_type"]
        response = await self.client.get("/api/maintenance/", params=params)
        response.raise_for_status()
        return {"records": response.json()}

    async def _add_maintenance(self, args: dict) -> dict:
        """Add maintenance record."""
        response = await self.client.post("/api/maintenance/", json=args)
        response.raise_for_status()
        return response.json()

    async def _get_reminders(self, args: dict) -> dict:
        """Get reminders."""
        response = await self.client.get("/api/reminders/upcoming")
        response.raise_for_status()
        return {"reminders": response.json()}

    async def _smart_reminders(self) -> dict:
        """Get smart recommendations."""
        response = await self.client.get("/api/reminders/smart")
        response.raise_for_status()
        return {"recommendations": response.json()}

    async def _complete_reminder(self, args: dict) -> dict:
        """Complete a reminder."""
        data = {
            "create_maintenance": args.get("create_maintenance", True),
        }
        if "cost" in args:
            data["cost"] = args["cost"]
        if "service_provider" in args:
            data["service_provider"] = args["service_provider"]

        response = await self.client.post(
            f"/api/reminders/{args['reminder_id']}/complete",
            json=data,
        )
        response.raise_for_status()
        return response.json()

    async def _moe_ask(self, args: dict) -> dict:
        """Ask using Mixture of Experts."""
        response = await self.client.post(
            "/api/moe/ask",
            json={"query": args["question"]},
        )
        response.raise_for_status()
        return response.json()

    def get_server_info(self) -> dict:
        """Return server information."""
        return {
            "name": "driveiq",
            "version": "1.0.0",
            "description": "DriveIQ Vehicle Management MCP Server",
        }

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()


async def handle_message(server: DriveIQMCPServer, message: dict) -> Optional[dict]:
    """Handle an incoming MCP message."""
    method = message.get("method")
    msg_id = message.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "serverInfo": server.get_server_info(),
                "capabilities": {
                    "tools": {},
                },
            },
        }

    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "tools": server.tools,
            },
        }

    elif method == "tools/call":
        params = message.get("params", {})
        tool_name = params.get("name")
        arguments = params.get("arguments", {})

        result = await server.handle_tool_call(tool_name, arguments)

        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(result, indent=2),
                    }
                ],
            },
        }

    elif method == "notifications/initialized":
        # Client initialized notification - no response needed
        return None

    else:
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "error": {
                "code": -32601,
                "message": f"Method not found: {method}",
            },
        }


async def main():
    """Main entry point for MCP server."""
    server = DriveIQMCPServer()
    logger.info("DriveIQ MCP Server started")

    try:
        # Read from stdin, write to stdout (stdio transport)
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        await asyncio.get_event_loop().connect_read_pipe(lambda: protocol, sys.stdin)

        writer_transport, writer_protocol = await asyncio.get_event_loop().connect_write_pipe(
            asyncio.streams.FlowControlMixin, sys.stdout
        )
        writer = asyncio.StreamWriter(writer_transport, writer_protocol, reader, asyncio.get_event_loop())

        while True:
            # Read content-length header
            header_line = await reader.readline()
            if not header_line:
                break

            header = header_line.decode().strip()
            if not header.startswith("Content-Length:"):
                continue

            content_length = int(header.split(":")[1].strip())

            # Read empty line
            await reader.readline()

            # Read content
            content = await reader.read(content_length)
            message = json.loads(content.decode())

            logger.debug(f"Received: {message}")

            response = await handle_message(server, message)
            if response:
                response_json = json.dumps(response)
                response_bytes = response_json.encode()
                output = f"Content-Length: {len(response_bytes)}\r\n\r\n".encode() + response_bytes
                writer.write(output)
                await writer.drain()
                logger.debug(f"Sent: {response}")

    except Exception as e:
        logger.error(f"Server error: {e}")
    finally:
        await server.close()
        logger.info("DriveIQ MCP Server stopped")


if __name__ == "__main__":
    asyncio.run(main())
