#!/usr/bin/env python3
"""
Database Performance Testing Harness for Districtr

This CLI tool simulates user workflows for creating documents and uploading
district assignments. It supports both the current (incremental) and new (atomic)
update schemas.

Usage examples:
    # Test current schema with 5 users, breaking assignments into 10 requests
    python cli.py test \
        --schema current \
        --api-url http://localhost:8000 \
        --users 5 \
        --assignments-file assignments.json \
        --chunk-requests 10 \
        --map-slug ca_congressional_districts

    # Test new schema with 5 users, 500ms delay between users
    python cli.py test \
        --schema new \
        --api-url http://localhost:8000 \
        --users 5 \
        --assignments-file assignments.json \
        --user-delay 0.5 \
        --map-slug ca_congressional_districts
"""

import asyncio
import json
import random
import string
import statistics
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

import click
import httpx


@dataclass
class RequestTiming:
    """Stores timing information for a single request."""
    request_type: str
    user_id: str
    duration_ms: float
    status_code: int
    success: bool
    error: str | None = None


@dataclass
class UserSession:
    """Represents a user session with document and timing data."""
    user_id: str
    document_id: str | None = None
    updated_at: str | None = None  # Timestamp from document creation (for new schema)
    timings: list[RequestTiming] = field(default_factory=list)
    total_duration_ms: float = 0.0


@dataclass
class TestResults:
    """Aggregated test results."""
    schema: str
    total_users: int
    total_requests: int
    total_duration_ms: float
    successful_requests: int
    failed_requests: int
    timings: list[RequestTiming] = field(default_factory=list)

    def calculate_percentile(self, p: float) -> float:
        """Calculate percentile of request durations."""
        if not self.timings:
            return 0.0
        durations = sorted(t.duration_ms for t in self.timings)
        k = (len(durations) - 1) * (p / 100)
        f = int(k)
        c = f + 1 if f + 1 < len(durations) else f
        return durations[f] + (k - f) * (durations[c] - durations[f])

    def get_stats_by_type(self, request_type: str) -> dict[str, float]:
        """Get statistics for a specific request type."""
        type_timings = [t for t in self.timings if t.request_type == request_type]
        if not type_timings:
            return {"count": 0, "total": 0, "avg": 0, "q10": 0, "q50": 0, "q90": 0, "min": 0, "max": 0}
        
        durations = [t.duration_ms for t in type_timings]
        sorted_durations = sorted(durations)
        
        def percentile(p: float) -> float:
            if len(sorted_durations) == 1:
                return sorted_durations[0]
            k = (len(sorted_durations) - 1) * (p / 100)
            f = int(k)
            c = min(f + 1, len(sorted_durations) - 1)
            return sorted_durations[f] + (k - f) * (sorted_durations[c] - sorted_durations[f])
        
        return {
            "count": len(type_timings),
            "total": sum(durations),
            "avg": statistics.mean(durations),
            "q10": percentile(10),
            "q50": percentile(50),
            "q90": percentile(90),
            "min": min(durations),
            "max": max(durations),
        }

    def print_summary(self):
        """Print a formatted summary of the test results."""
        click.echo("\n" + "=" * 70)
        click.echo(f"  DATABASE PERFORMANCE TEST RESULTS ({self.schema.upper()} SCHEMA)")
        click.echo("=" * 70)
        
        click.echo(f"\n📊 Overview:")
        click.echo(f"  • Total Users:       {self.total_users}")
        click.echo(f"  • Total Requests:    {self.total_requests}")
        click.echo(f"  • Successful:        {self.successful_requests}")
        click.echo(f"  • Failed:            {self.failed_requests}")
        click.echo(f"  • Total Duration:    {self.total_duration_ms:.2f} ms ({self.total_duration_ms / 1000:.2f} s)")
        
        # Stats by request type
        request_types = list(set(t.request_type for t in self.timings))
        
        for req_type in sorted(request_types):
            stats = self.get_stats_by_type(req_type)
            if stats["count"] == 0:
                continue
            
            click.echo(f"\n📈 {req_type.replace('_', ' ').title()} ({stats['count']} requests):")
            click.echo(f"  • Total:     {stats['total']:>10.2f} ms ({stats['total'] / 1000:.2f} s)")
            click.echo(f"  • Average:   {stats['avg']:>10.2f} ms")
            click.echo(f"  • Q10:       {stats['q10']:>10.2f} ms")
            click.echo(f"  • Q50:       {stats['q50']:>10.2f} ms")
            click.echo(f"  • Q90:       {stats['q90']:>10.2f} ms")
            click.echo(f"  • Min:       {stats['min']:>10.2f} ms")
            click.echo(f"  • Max:       {stats['max']:>10.2f} ms")
        
        # Overall stats
        if self.timings:
            all_durations = [t.duration_ms for t in self.timings]
            total_request_time = sum(all_durations)
            click.echo(f"\n📈 All Requests Combined ({len(all_durations)} total):")
            click.echo(f"  • Total:     {total_request_time:>10.2f} ms ({total_request_time / 1000:.2f} s)")
            click.echo(f"  • Average:   {statistics.mean(all_durations):>10.2f} ms")
            click.echo(f"  • Q10:       {self.calculate_percentile(10):>10.2f} ms")
            click.echo(f"  • Q50:       {self.calculate_percentile(50):>10.2f} ms")
            click.echo(f"  • Q90:       {self.calculate_percentile(90):>10.2f} ms")
        
        click.echo("\n" + "=" * 70 + "\n")


def generate_user_id(length: int = 21) -> str:
    """Generate a random user ID similar to the frontend format."""
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(length))


def get_current_timestamp() -> str:
    """Get current timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def chunk_list(lst: list, n: int) -> list[list]:
    """Split a list into n roughly equal chunks."""
    if n <= 0:
        return [lst]
    k, m = divmod(len(lst), n)
    return [lst[i * k + min(i, m):(i + 1) * k + min(i + 1, m)] for i in range(n)]


class DistrictrTestClient:
    """HTTP client for testing Districtr API endpoints."""
    
    def __init__(
        self,
        api_url: str,
        schema: Literal["current", "new"],
        timeout: float = 60.0,
        verbose: bool = False
    ):
        self.api_url = api_url.rstrip('/')
        self.schema = schema
        self.timeout = timeout
        self.verbose = verbose
        self.client: httpx.AsyncClient | None = None
    
    async def __aenter__(self):
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout),
            headers={
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json',
            }
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.client:
            await self.client.aclose()
    
    async def create_document(
        self,
        map_slug: str,
        user_id: str | None = None
    ) -> tuple[RequestTiming, dict[str, Any]]:
        """Create a new document and return timing + response data."""
        start = time.perf_counter()
        
        if self.schema == "current":
            payload = {
                "districtr_map_slug": map_slug,
                "user_id": user_id or generate_user_id()
            }
        else:  # new schema
            payload = {
                "districtr_map_slug": map_slug
            }
        
        try:
            response = await self.client.post(
                f"{self.api_url}/api/create_document",
                json=payload
            )
            duration_ms = (time.perf_counter() - start) * 1000
            
            timing = RequestTiming(
                request_type="create_document",
                user_id=user_id or "anonymous",
                duration_ms=duration_ms,
                status_code=response.status_code,
                success=response.status_code in (200, 201),
            )
            
            if self.verbose:
                click.echo(f"  [CREATE] User {user_id[:8]}... Status: {response.status_code} Time: {duration_ms:.2f}ms")
            
            if response.status_code in (200, 201):
                return timing, response.json()
            else:
                timing.error = response.text
                return timing, {}
                
        except Exception as e:
            duration_ms = (time.perf_counter() - start) * 1000
            return RequestTiming(
                request_type="create_document",
                user_id=user_id or "anonymous",
                duration_ms=duration_ms,
                status_code=0,
                success=False,
                error=str(e)
            ), {}
    
    async def update_assignments_current(
        self,
        document_id: str,
        assignments: list[dict],
        user_id: str
    ) -> RequestTiming:
        """Update assignments using the current (incremental) schema."""
        start = time.perf_counter()
        
        # Add document_id to each assignment
        formatted_assignments = [
            {
                "document_id": document_id,
                "geo_id": a.get("geo_id"),
                "zone": a.get("zone")
            }
            for a in assignments
        ]
        
        payload = {
            "assignments": formatted_assignments,
            "updated_at": get_current_timestamp(),
            "user_id": user_id
        }
        
        try:
            response = await self.client.patch(
                f"{self.api_url}/api/update_assignments",
                json=payload
            )
            duration_ms = (time.perf_counter() - start) * 1000
            
            timing = RequestTiming(
                request_type="update_assignments",
                user_id=user_id,
                duration_ms=duration_ms,
                status_code=response.status_code,
                success=response.status_code in (200, 201, 204),
            )
            
            if self.verbose:
                click.echo(f"  [UPDATE] User {user_id[:8]}... {len(assignments)} assignments, Status: {response.status_code} Time: {duration_ms:.2f}ms")
            
            if response.status_code not in (200, 201, 204):
                timing.error = response.text
            
            return timing
            
        except Exception as e:
            duration_ms = (time.perf_counter() - start) * 1000
            return RequestTiming(
                request_type="update_assignments",
                user_id=user_id,
                duration_ms=duration_ms,
                status_code=0,
                success=False,
                error=str(e)
            )
    
    async def update_assignments_new(
        self,
        document_id: str,
        assignments: list[dict],
        last_updated_at: str,
        overwrite: bool = False
    ) -> RequestTiming:
        """Update assignments using the new (atomic) schema."""
        start = time.perf_counter()
        
        # Add document_id and parent_path to each assignment
        formatted_assignments = [
            {
                "document_id": document_id,
                "geo_id": a.get("geo_id"),
                "zone": a.get("zone"),
                "parent_path": a.get("parent_path")
            }
            for a in assignments
        ]
        
        payload = {
            "assignments": formatted_assignments,
            "document_id": document_id,
            "last_updated_at": last_updated_at,
            "overwrite": overwrite
        }
        
        try:
            response = await self.client.put(
                f"{self.api_url}/api/assignments",
                json=payload
            )
            duration_ms = (time.perf_counter() - start) * 1000
            
            timing = RequestTiming(
                request_type="update_assignments",
                user_id=document_id[:8],
                duration_ms=duration_ms,
                status_code=response.status_code,
                success=response.status_code in (200, 201, 204),
            )
            
            if self.verbose:
                click.echo(f"  [UPDATE] Doc {document_id[:8]}... {len(assignments)} assignments, Status: {response.status_code} Time: {duration_ms:.2f}ms")
            
            if response.status_code not in (200, 201, 204):
                timing.error = response.text
            
            return timing
            
        except Exception as e:
            duration_ms = (time.perf_counter() - start) * 1000
            return RequestTiming(
                request_type="update_assignments",
                user_id=document_id[:8],
                duration_ms=duration_ms,
                status_code=0,
                success=False,
                error=str(e)
            )

    async def get_assignments(
        self,
        document_id: str
    ) -> tuple[RequestTiming, list[dict]]:
        """Fetch assignments for a document (new schema only)."""
        start = time.perf_counter()
        
        try:
            response = await self.client.get(
                f"{self.api_url}/api/get_assignments/{document_id}"
            )
            duration_ms = (time.perf_counter() - start) * 1000
            
            timing = RequestTiming(
                request_type="get_assignments",
                user_id=document_id[:8],
                duration_ms=duration_ms,
                status_code=response.status_code,
                success=response.status_code == 200,
            )
            
            if self.verbose:
                click.echo(f"  [GET] Doc {document_id[:8]}... Status: {response.status_code} Time: {duration_ms:.2f}ms")
            
            if response.status_code == 200:
                return timing, response.json()
            else:
                timing.error = response.text
                return timing, []
                
        except Exception as e:
            duration_ms = (time.perf_counter() - start) * 1000
            return RequestTiming(
                request_type="get_assignments",
                user_id=document_id[:8],
                duration_ms=duration_ms,
                status_code=0,
                success=False,
                error=str(e)
            ), []


async def create_document_current(
    client: DistrictrTestClient,
    map_slug: str,
    user_index: int
) -> UserSession:
    """Create a document for a user session (current schema, phase 1)."""
    user_id = generate_user_id()
    session = UserSession(user_id=user_id)
    
    click.echo(f"\n👤 User {user_index + 1} ({user_id[:8]}...) creating document...")
    
    # Create document
    timing, response = await client.create_document(map_slug, user_id)
    session.timings.append(timing)
    
    if not timing.success:
        click.echo(f"  ❌ Failed to create document: {timing.error}")
        return session
    
    document_id = response.get("document_id")
    session.document_id = document_id
    click.echo(f"  ✓ Document created: {document_id[:8]}... ({timing.duration_ms:.2f}ms)")
    
    return session


async def update_assignments_current_phase(
    client: DistrictrTestClient,
    session: UserSession,
    assignments: list[dict],
    chunk_requests: int,
    user_index: int,
    chunk_delay: float = 0.0
) -> UserSession:
    """Update assignments for a user session (current schema, phase 2)."""
    if not session.document_id:
        click.echo(f"\n👤 User {user_index + 1} skipped (no document)")
        return session
    
    document_id = session.document_id
    user_id = session.user_id
    
    click.echo(f"\n👤 User {user_index + 1} ({user_id[:8]}...) updating assignments...")
    
    # Split assignments into chunks and send them
    chunks = chunk_list(assignments, chunk_requests)
    
    for i, chunk in enumerate(chunks):
        if not chunk:
            continue
        
        timing = await client.update_assignments_current(document_id, chunk, user_id)
        session.timings.append(timing)
        
        if not timing.success:
            click.echo(f"  ❌ User {user_index + 1} chunk {i + 1}/{len(chunks)}: Failed - {timing.error}")
        else:
            click.echo(f"  ✓ User {user_index + 1} chunk {i + 1}/{len(chunks)}: {len(chunk)} geographies, {timing.duration_ms:.2f}ms")
        
        # Delay between chunks (except after the last chunk)
        if chunk_delay > 0 and i < len(chunks) - 1:
            await asyncio.sleep(chunk_delay)
    
    session.total_duration_ms = sum(t.duration_ms for t in session.timings)
    click.echo(f"  📊 User {user_index + 1} complete: {session.total_duration_ms:.2f}ms total")
    
    return session


async def run_user_session_current(
    client: DistrictrTestClient,
    map_slug: str,
    assignments: list[dict],
    chunk_requests: int,
    user_index: int,
    chunk_delay: float = 0.0
) -> UserSession:
    """Run a complete user session with the current schema (all phases together)."""
    session = await create_document_current(client, map_slug, user_index)
    if session.document_id:
        session = await update_assignments_current_phase(
            client, session, assignments, chunk_requests, user_index, chunk_delay
        )
    return session


async def create_document_new(
    client: DistrictrTestClient,
    map_slug: str,
    user_index: int
) -> UserSession:
    """Create a document for a user session (new schema, phase 1)."""
    user_id = generate_user_id()
    session = UserSession(user_id=user_id)
    
    click.echo(f"\n👤 User {user_index + 1} ({user_id[:8]}...) creating document...")
    
    # Create document
    timing, response = await client.create_document(map_slug)
    session.timings.append(timing)
    
    if not timing.success:
        click.echo(f"  ❌ Failed to create document: {timing.error}")
        return session
    
    document_id = response.get("document_id")
    updated_at = response.get("updated_at", get_current_timestamp())
    session.document_id = document_id
    # Store updated_at for later use in update phase
    session.updated_at = updated_at
    click.echo(f"  ✓ Document created: {document_id[:8]}... ({timing.duration_ms:.2f}ms)")
    
    return session


async def update_assignments_new_phase(
    client: DistrictrTestClient,
    session: UserSession,
    assignments: list[dict],
    user_index: int,
    overwrite: bool = False
) -> UserSession:
    """Update assignments for a user session (new schema, phase 2)."""
    if not session.document_id:
        click.echo(f"\n👤 User {user_index + 1} skipped (no document)")
        return session
    
    document_id = session.document_id
    updated_at = getattr(session, 'updated_at', get_current_timestamp())
    
    click.echo(f"\n👤 User {user_index + 1} ({session.user_id[:8]}...) updating assignments...")
    
    # Send all assignments in one atomic update
    timing = await client.update_assignments_new(document_id, assignments, updated_at, overwrite)
    session.timings.append(timing)
    
    if not timing.success:
        click.echo(f"  ❌ Failed to update assignments: {timing.error}")
    else:
        click.echo(f"  ✓ Updated assignments: {len(assignments)} geographies, {timing.duration_ms:.2f}ms")
    
    # Fetch assignments after successful update (simulates client reload)
    if timing.success:
        get_timing, fetched_assignments = await client.get_assignments(document_id)
        session.timings.append(get_timing)
        
        if not get_timing.success:
            click.echo(f"  ❌ Failed to fetch assignments: {get_timing.error}")
        else:
            click.echo(f"  ✓ Fetched assignments: {len(fetched_assignments)} geographies, {get_timing.duration_ms:.2f}ms")
    
    session.total_duration_ms = sum(t.duration_ms for t in session.timings)
    click.echo(f"  📊 User {user_index + 1} complete: {session.total_duration_ms:.2f}ms total")
    
    return session


async def run_user_session_new(
    client: DistrictrTestClient,
    map_slug: str,
    assignments: list[dict],
    user_index: int,
    overwrite: bool = False
) -> UserSession:
    """Run a complete user session with the new schema (all phases together)."""
    session = await create_document_new(client, map_slug, user_index)
    if session.document_id:
        session = await update_assignments_new_phase(client, session, assignments, user_index, overwrite)
    return session


async def run_user_with_delay(
    coro,
    delay: float,
    user_index: int
):
    """Run a coroutine after an initial delay (for staggered starts)."""
    if delay > 0:
        click.echo(f"  ⏳ User {user_index + 1} waiting {delay}s before starting...")
        await asyncio.sleep(delay)
    return await coro


async def run_test(
    api_url: str,
    schema: Literal["current", "new"],
    users: int,
    assignments: list[dict],
    map_slug: str,
    chunk_requests: int = 1,
    chunk_delay: float = 0.0,
    user_delay: float = 0.0,
    verbose: bool = False,
    concurrent: bool = True
) -> TestResults:
    """Run the complete performance test."""
    
    click.echo(f"\n🚀 Starting performance test")
    click.echo(f"  • Schema:          {schema}")
    click.echo(f"  • API URL:         {api_url}")
    click.echo(f"  • Users:           {users}")
    click.echo(f"  • Assignments:     {len(assignments)}")
    click.echo(f"  • Map Slug:        {map_slug}")
    
    if schema == "current":
        click.echo(f"  • Chunk Requests:  {chunk_requests}")
        if chunk_delay > 0:
            click.echo(f"  • Chunk Delay:     {chunk_delay}s (between chunks)")
        if user_delay > 0:
            click.echo(f"  • User Delay:      {user_delay}s (staggered start times)")
    else:
        if user_delay > 0:
            click.echo(f"  • User Delay:      {user_delay}s (between update requests)")
    
    click.echo(f"  • Concurrent:      {concurrent}")
    
    all_timings: list[RequestTiming] = []
    start_time = time.perf_counter()
    
    async with DistrictrTestClient(api_url, schema, verbose=verbose) as client:
        if schema == "current":
            # Current schema: users run concurrently with staggered start times
            # Each user runs their full session (create + chunked updates)
            # user_delay staggers when each user STARTS their session
            # chunk_delay adds delay between chunks within each user's session
            
            if user_delay > 0:
                click.echo(f"\n🏃 Running {users} users with staggered starts ({user_delay}s apart)...")
            else:
                click.echo(f"\n🏃 Running {users} users concurrently...")
            
            # Launch all users concurrently, but with staggered start times
            tasks = [
                run_user_with_delay(
                    run_user_session_current(
                        client, map_slug, assignments, chunk_requests, i, chunk_delay
                    ),
                    delay=i * user_delay,
                    user_index=i
                )
                for i in range(users)
            ]
            sessions = await asyncio.gather(*tasks)
        else:
            # New schema: phased approach with delay between update requests
            # Phase 1: Create all documents concurrently
            click.echo(f"\n📄 Phase 1: Creating {users} documents concurrently...")
            create_tasks = [
                create_document_new(client, map_slug, i)
                for i in range(users)
            ]
            sessions = await asyncio.gather(*create_tasks)
            
            successful_creates = sum(1 for s in sessions if s.document_id)
            click.echo(f"  ✓ Created {successful_creates}/{users} documents")
            
            # Phase 2: Update assignments with staggered delays
            click.echo(f"\n📝 Phase 2: Updating assignments" + 
                      (f" (with {user_delay}s delay between users)..." if user_delay > 0 else "..."))
            
            if concurrent and user_delay == 0:
                # Fully concurrent updates (no delay)
                update_tasks = [
                    update_assignments_new_phase(client, session, assignments, i)
                    for i, session in enumerate(sessions)
                    if session.document_id
                ]
                await asyncio.gather(*update_tasks)
            else:
                # Staggered updates with delay between each
                for i, session in enumerate(sessions):
                    if session.document_id:
                        await update_assignments_new_phase(client, session, assignments, i)
                        
                        if user_delay > 0 and i < len(sessions) - 1:
                            # Check if next user has a valid document
                            remaining_valid = any(s.document_id for s in sessions[i+1:])
                            if remaining_valid:
                                click.echo(f"  ⏳ Waiting {user_delay}s before next update...")
                                await asyncio.sleep(user_delay)
        
        for session in sessions:
            all_timings.extend(session.timings)
    
    total_duration = (time.perf_counter() - start_time) * 1000
    
    results = TestResults(
        schema=schema,
        total_users=users,
        total_requests=len(all_timings),
        total_duration_ms=total_duration,
        successful_requests=sum(1 for t in all_timings if t.success),
        failed_requests=sum(1 for t in all_timings if not t.success),
        timings=all_timings
    )
    
    return results


def load_assignments(file_path: str) -> list[dict]:
    """Load assignments from a JSON file."""
    path = Path(file_path)
    
    if not path.exists():
        raise click.ClickException(f"Assignments file not found: {file_path}")
    
    with open(path, 'r') as f:
        data = json.load(f)
    
    # Handle both array format and object with "assignments" key
    if isinstance(data, list):
        return data
    elif isinstance(data, dict) and "assignments" in data:
        return data["assignments"]
    else:
        raise click.ClickException(
            "Invalid assignments file format. Expected array or object with 'assignments' key."
        )


# CLI Commands
@click.group()
def cli():
    """Districtr Database Performance Testing Harness"""
    pass


@cli.command()
@click.option(
    '--schema',
    type=click.Choice(['current', 'new']),
    required=True,
    help='Schema type to test (current=incremental, new=atomic)'
)
@click.option(
    '--api-url',
    required=True,
    help='Base URL of the API (e.g., http://localhost:8000)'
)
@click.option(
    '--users',
    type=int,
    default=1,
    help='Number of simultaneous users to simulate'
)
@click.option(
    '--assignments-file',
    required=True,
    type=click.Path(exists=True),
    help='Path to JSON file containing assignments'
)
@click.option(
    '--map-slug',
    required=True,
    help='Districtr map slug for document creation'
)
@click.option(
    '--chunk-requests',
    type=int,
    default=1,
    help='Number of requests to break assignments into (current schema only)'
)
@click.option(
    '--chunk-delay',
    type=float,
    default=0.0,
    help='Delay in seconds between chunks within a user request (current schema only)'
)
@click.option(
    '--user-delay',
    type=float,
    default=0.0,
    help='Delay in seconds between users starting their update requests'
)
@click.option(
    '--sequential',
    is_flag=True,
    default=False,
    help='Run users sequentially instead of concurrently'
)
@click.option(
    '--verbose',
    is_flag=True,
    default=False,
    help='Enable verbose output'
)
@click.option(
    '--output-json',
    type=click.Path(),
    help='Path to save results as JSON'
)
def test(
    schema: str,
    api_url: str,
    users: int,
    assignments_file: str,
    map_slug: str,
    chunk_requests: int,
    chunk_delay: float,
    user_delay: float,
    sequential: bool,
    verbose: bool,
    output_json: str | None
):
    """
    Run performance test against the Districtr API.
    
    Examples:
    
        # Test current schema with 5 users, 10 chunks per user, 100ms delay between chunks
        python cli.py test --schema current --api-url http://localhost:8000 \\
            --users 5 --assignments-file data.json --map-slug ca_congressional_districts \\
            --chunk-requests 10 --chunk-delay 0.1
        
        # Test current schema with staggered users (500ms between each user's updates)
        python cli.py test --schema current --api-url http://localhost:8000 \\
            --users 5 --assignments-file data.json --map-slug ca_congressional_districts \\
            --chunk-requests 10 --user-delay 0.5
        
        # Test new schema with 500ms delay between each user's update request
        python cli.py test --schema new --api-url http://localhost:8000 \\
            --users 5 --assignments-file data.json --map-slug ca_congressional_districts \\
            --user-delay 0.5
    """
    # Load assignments
    click.echo(f"\n📂 Loading assignments from {assignments_file}...")
    assignments = load_assignments(assignments_file)
    click.echo(f"   Loaded {len(assignments)} assignments")
    
    # Run the test
    results = asyncio.run(run_test(
        api_url=api_url,
        schema=schema,
        users=users,
        assignments=assignments,
        map_slug=map_slug,
        chunk_requests=chunk_requests,
        chunk_delay=chunk_delay,
        user_delay=user_delay,
        verbose=verbose,
        concurrent=not sequential
    ))
    
    # Print results
    results.print_summary()
    
    # Save to JSON if requested
    if output_json:
        output_data = {
            "schema": results.schema,
            "total_users": results.total_users,
            "total_requests": results.total_requests,
            "total_duration_ms": results.total_duration_ms,
            "successful_requests": results.successful_requests,
            "failed_requests": results.failed_requests,
            "statistics": {
                "create_document": results.get_stats_by_type("create_document"),
                "update_assignments": results.get_stats_by_type("update_assignments"),
            },
            "timings": [
                {
                    "request_type": t.request_type,
                    "user_id": t.user_id,
                    "duration_ms": t.duration_ms,
                    "status_code": t.status_code,
                    "success": t.success,
                    "error": t.error
                }
                for t in results.timings
            ]
        }
        
        with open(output_json, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        click.echo(f"📄 Results saved to {output_json}")


@cli.command()
@click.option(
    '--output',
    '-o',
    required=True,
    type=click.Path(),
    help='Output file path for sample assignments'
)
@click.option(
    '--count',
    '-n',
    type=int,
    default=100,
    help='Number of sample assignments to generate'
)
@click.option(
    '--zones',
    '-z',
    type=int,
    default=4,
    help='Number of zones/districts'
)
def generate_sample(output: str, count: int, zones: int):
    """
    Generate a sample assignments file for testing.
    
    Example:
        python cli.py generate-sample -o sample.json -n 1000 -z 10
    """
    sample_document_id = str(uuid4())
    
    assignments = []
    for i in range(count):
        assignments.append({
            "geo_id": f"geo_{i:06d}",
            "zone": random.randint(1, zones) if random.random() > 0.1 else None,
            "parent_path": None
        })
    
    with open(output, 'w') as f:
        json.dump(assignments, f, indent=2)
    
    click.echo(f"✓ Generated {count} sample assignments with {zones} zones")
    click.echo(f"  Saved to: {output}")


@cli.command()
@click.option(
    '--api-url',
    required=True,
    help='Base URL of the API to check'
)
def health(api_url: str):
    """Check if the API is reachable."""
    import httpx
    
    api_url = api_url.rstrip('/')
    
    try:
        response = httpx.get(f"{api_url}/api/health", timeout=5.0)
        if response.status_code == 200:
            click.echo(f"✓ API is healthy: {api_url}")
        else:
            click.echo(f"⚠ API returned status {response.status_code}: {api_url}")
    except httpx.ConnectError:
        click.echo(f"❌ Cannot connect to API: {api_url}")
    except Exception as e:
        click.echo(f"❌ Error checking API: {e}")


@cli.command()
@click.option(
    '--schema',
    type=click.Choice(['current', 'new']),
    required=True,
    help='Schema type to test'
)
@click.option(
    '--api-url',
    required=True,
    help='Base URL of the API'
)
@click.option(
    '--assignments-file',
    required=True,
    type=click.Path(exists=True),
    help='Path to JSON file containing assignments'
)
@click.option(
    '--map-slug',
    required=True,
    help='Districtr map slug'
)
@click.option(
    '--min-users',
    type=int,
    default=1,
    help='Minimum number of users'
)
@click.option(
    '--max-users',
    type=int,
    default=10,
    help='Maximum number of users'
)
@click.option(
    '--step',
    type=int,
    default=1,
    help='User count step size'
)
@click.option(
    '--output-json',
    type=click.Path(),
    help='Path to save sweep results as JSON'
)
def sweep(
    schema: str,
    api_url: str,
    assignments_file: str,
    map_slug: str,
    min_users: int,
    max_users: int,
    step: int,
    output_json: str | None
):
    """
    Run a parameter sweep test with varying user counts.
    
    Example:
        python cli.py sweep --schema new --api-url http://localhost:8000 \\
            --assignments-file data.json --map-slug ca_congressional_districts \\
            --min-users 1 --max-users 20 --step 5
    """
    assignments = load_assignments(assignments_file)
    
    click.echo(f"\n🔄 Starting parameter sweep")
    click.echo(f"  • Users: {min_users} to {max_users} (step {step})")
    
    all_results = []
    
    for user_count in range(min_users, max_users + 1, step):
        click.echo(f"\n{'='*50}")
        click.echo(f"Running with {user_count} users...")
        
        results = asyncio.run(run_test(
            api_url=api_url,
            schema=schema,
            users=user_count,
            assignments=assignments,
            map_slug=map_slug,
            chunk_requests=1,
            chunk_delay=0.0,
            user_delay=0.0,
            verbose=False,
            concurrent=True
        ))
        
        results.print_summary()
        
        result_entry = {
            "users": user_count,
            "total_duration_ms": results.total_duration_ms,
            "successful_requests": results.successful_requests,
            "failed_requests": results.failed_requests,
            "create_document_stats": results.get_stats_by_type("create_document"),
            "update_assignments_stats": results.get_stats_by_type("update_assignments"),
        }
        # Add get_assignments stats if present (new schema only)
        get_stats = results.get_stats_by_type("get_assignments")
        if get_stats["count"] > 0:
            result_entry["get_assignments_stats"] = get_stats
        
        all_results.append(result_entry)
    
    # Print sweep summary
    click.echo("\n" + "=" * 70)
    click.echo("  PARAMETER SWEEP SUMMARY")
    click.echo("=" * 70)
    
    # Check if we have get_assignments data (new schema)
    has_get_stats = any("get_assignments_stats" in r for r in all_results)
    
    if has_get_stats:
        click.echo(f"\n{'Users':>6} | {'Total (ms)':>12} | {'Avg Create':>12} | {'Avg Update':>12} | {'Avg Get':>12}")
        click.echo("-" * 72)
        
        for r in all_results:
            create_avg = r["create_document_stats"].get("avg", 0)
            update_avg = r["update_assignments_stats"].get("avg", 0)
            get_avg = r.get("get_assignments_stats", {}).get("avg", 0)
            click.echo(f"{r['users']:>6} | {r['total_duration_ms']:>12.2f} | {create_avg:>12.2f} | {update_avg:>12.2f} | {get_avg:>12.2f}")
    else:
        click.echo(f"\n{'Users':>6} | {'Total (ms)':>12} | {'Avg Create (ms)':>16} | {'Avg Update (ms)':>16}")
        click.echo("-" * 60)
        
        for r in all_results:
            create_avg = r["create_document_stats"].get("avg", 0)
            update_avg = r["update_assignments_stats"].get("avg", 0)
            click.echo(f"{r['users']:>6} | {r['total_duration_ms']:>12.2f} | {create_avg:>16.2f} | {update_avg:>16.2f}")
    
    if output_json:
        with open(output_json, 'w') as f:
            json.dump(all_results, f, indent=2)
        click.echo(f"\n📄 Sweep results saved to {output_json}")


if __name__ == '__main__':
    cli()

