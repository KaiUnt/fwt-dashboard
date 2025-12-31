"""
Supabase Client

REST API client for Supabase with input validation and sanitization.
Extracted from backend_api.py for modularity.
"""

import re
import logging
from typing import Optional, Any, Dict, List, Union
import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)


class SupabaseClient:
    """
    Supabase REST API client with built-in validation and sanitization.

    Usage:
        client = SupabaseClient(url, key)
        result = await client.select("users", "*", {"id": "123"}, user_token=token)
    """

    def __init__(self, url: str, key: str):
        if not url or not key:
            raise ValueError("Supabase URL and key are required")

        self.url = url.rstrip('/')
        self.key = key  # This is the anon key for public access

    def _get_headers(self, user_token: Optional[str] = None) -> Dict[str, str]:
        """Get headers for Supabase request, preferring user token for RLS."""
        headers = {
            "apikey": self.key,  # Always required
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

        if user_token:
            # Use user JWT token for RLS-enabled operations
            headers["Authorization"] = f"Bearer {user_token}"
        else:
            # Fall back to service key for non-RLS operations
            headers["Authorization"] = f"Bearer {self.key}"

        return headers

    def _validate_table_name(self, table: str) -> None:
        """Validate table name to prevent injection."""
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table):
            raise ValueError("Invalid table name")

    def _validate_filter_key(self, key: str) -> None:
        """Validate filter key to prevent injection."""
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', key):
            raise ValueError(f"Invalid filter key: {key}")

    def _build_filter_params(self, filters: Optional[Dict[str, Any]]) -> Dict[str, str]:
        """Build PostgREST filter parameters."""
        params = {}
        if not filters:
            return params

        for key, value in filters.items():
            self._validate_filter_key(key)

            if isinstance(value, (list, tuple)):
                # Build PostgREST in.("a","b") syntax
                if len(value) == 0:
                    params[key] = "in.("  # Empty IN yields no results
                else:
                    def _quote(v):
                        if isinstance(v, (int, float)):
                            return str(v)
                        s = str(v).replace('"', '\\"')
                        return f'"{s}"'

                    joined = ",".join(_quote(v) for v in value)
                    params[key] = f"in.({joined})"
            elif isinstance(value, str) and value.startswith("ilike."):
                # Pass through ilike filters directly (e.g., "ilike.*search*")
                params[key] = value
            else:
                params[key] = f"eq.{value}"

        return params

    def _sanitize_data(self, data: Union[Dict, List, Any]) -> Any:
        """Sanitize input data to prevent XSS and limit sizes."""
        if isinstance(data, list):
            return [self._sanitize_data(item) for item in data]

        if not isinstance(data, dict):
            return data

        sanitized = {}
        for key, value in data.items():
            # Validate key names
            if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', key):
                logger.warning(f"Skipping invalid key: {key}")
                continue

            # Sanitize strings
            if isinstance(value, str):
                # Remove potential XSS vectors
                value = re.sub(r'<script[^>]*>.*?</script>', '', value, flags=re.IGNORECASE | re.DOTALL)
                value = value.strip()
                # Limit string length
                if len(value) > 10000:
                    value = value[:10000]
            elif isinstance(value, dict):
                value = self._sanitize_data(value)

            sanitized[key] = value

        return sanitized

    async def _handle_response(self, response: httpx.Response, operation: str) -> Any:
        """Handle response and errors consistently."""
        if response.status_code == 401:
            raise HTTPException(
                status_code=401,
                detail="Database authentication failed - user token may be invalid"
            )

        try:
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Supabase {operation} error: {e.response.status_code} - {e.response.text}")
            raise HTTPException(status_code=500, detail="Database error")

    async def select(
        self,
        table: str,
        columns: str = "*",
        filters: Optional[Dict[str, Any]] = None,
        user_token: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None
    ) -> List[Dict]:
        """
        Select data from table.

        Args:
            table: Table name
            columns: Columns to select (default: "*")
            filters: Filter conditions as dict
            user_token: User JWT for RLS
            limit: Maximum number of rows to return
            offset: Number of rows to skip

        Returns:
            List of matching records
        """
        self._validate_table_name(table)

        url = f"{self.url}/rest/v1/{table}"
        params = {"select": columns}
        params.update(self._build_filter_params(filters))
        if limit is not None:
            params["limit"] = str(limit)
        if offset is not None:
            params["offset"] = str(offset)
        headers = self._get_headers(user_token)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=headers, params=params)
                return await self._handle_response(response, "select")
        except httpx.TimeoutException:
            logger.error("Supabase request timeout")
            raise HTTPException(status_code=504, detail="Database request timeout")

    async def select_all(
        self,
        table: str,
        columns: str = "*",
        filters: Optional[Dict[str, Any]] = None,
        user_token: Optional[str] = None,
        batch_size: int = 1000
    ) -> List[Dict]:
        """
        Select ALL data from table using pagination to bypass the 1000 row limit.

        Args:
            table: Table name
            columns: Columns to select (default: "*")
            filters: Filter conditions as dict
            user_token: User JWT for RLS
            batch_size: Number of rows per request (default: 1000)

        Returns:
            List of ALL matching records
        """
        all_results = []
        offset = 0

        while True:
            batch = await self.select(
                table=table,
                columns=columns,
                filters=filters,
                user_token=user_token,
                limit=batch_size,
                offset=offset
            )

            if not batch:
                break

            all_results.extend(batch)
            offset += batch_size

            # If we got fewer rows than batch_size, we're done
            if len(batch) < batch_size:
                break

        return all_results

    async def insert(
        self,
        table: str,
        data: Union[Dict, List[Dict]],
        user_token: Optional[str] = None
    ) -> List[Dict]:
        """
        Insert data into table.

        Args:
            table: Table name
            data: Record(s) to insert
            user_token: User JWT for RLS

        Returns:
            Inserted record(s)
        """
        self._validate_table_name(table)

        sanitized_data = self._sanitize_data(data)
        url = f"{self.url}/rest/v1/{table}"
        headers = self._get_headers(user_token)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, headers=headers, json=sanitized_data)
                return await self._handle_response(response, "insert")
        except httpx.TimeoutException:
            logger.error("Supabase request timeout")
            raise HTTPException(status_code=504, detail="Database request timeout")

    async def update(
        self,
        table: str,
        data: Dict,
        filters: Dict,
        user_token: Optional[str] = None
    ) -> List[Dict]:
        """
        Update data in table.

        Args:
            table: Table name
            data: Fields to update
            filters: Filter conditions to match records
            user_token: User JWT for RLS

        Returns:
            Updated record(s)
        """
        self._validate_table_name(table)

        sanitized_data = self._sanitize_data(data)
        url = f"{self.url}/rest/v1/{table}"
        params = self._build_filter_params(filters)
        headers = self._get_headers(user_token)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.patch(url, headers=headers, params=params, json=sanitized_data)
                return await self._handle_response(response, "update")
        except httpx.TimeoutException:
            logger.error("Supabase request timeout")
            raise HTTPException(status_code=504, detail="Database request timeout")

    async def delete(
        self,
        table: str,
        filters: Dict,
        user_token: Optional[str] = None
    ) -> List[Dict]:
        """
        Delete data from table.

        Args:
            table: Table name
            filters: Filter conditions to match records
            user_token: User JWT for RLS

        Returns:
            Deleted record(s)
        """
        self._validate_table_name(table)

        url = f"{self.url}/rest/v1/{table}"
        params = self._build_filter_params(filters)
        headers = self._get_headers(user_token)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.delete(url, headers=headers, params=params)
                return await self._handle_response(response, "delete")
        except httpx.TimeoutException:
            logger.error("Supabase request timeout")
            raise HTTPException(status_code=504, detail="Database request timeout")

    async def upsert(
        self,
        table: str,
        data: Union[Dict, List[Dict]],
        on_conflict: str = "id",
        user_token: Optional[str] = None
    ) -> List[Dict]:
        """
        Upsert (insert or update) data into table.

        Args:
            table: Table name
            data: Record(s) to upsert
            on_conflict: Column(s) to use for conflict resolution (default: "id")
            user_token: User JWT for RLS

        Returns:
            Upserted record(s)
        """
        self._validate_table_name(table)
        self._validate_filter_key(on_conflict)

        sanitized_data = self._sanitize_data(data)
        url = f"{self.url}/rest/v1/{table}"
        headers = self._get_headers(user_token)
        # Add upsert header with merge-duplicates resolution
        headers["Prefer"] = "return=representation,resolution=merge-duplicates"

        params = {"on_conflict": on_conflict}

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=headers, params=params, json=sanitized_data)
                return await self._handle_response(response, "upsert")
        except httpx.TimeoutException:
            logger.error("Supabase request timeout")
            raise HTTPException(status_code=504, detail="Database request timeout")

    async def rpc(
        self,
        function_name: str,
        params: Optional[Dict] = None,
        user_token: Optional[str] = None
    ) -> Any:
        """
        Call RPC function.

        Args:
            function_name: Name of the function to call
            params: Parameters to pass to the function
            user_token: User JWT for RLS

        Returns:
            Function result
        """
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', function_name):
            raise ValueError("Invalid function name")

        url = f"{self.url}/rest/v1/rpc/{function_name}"
        sanitized_params = self._sanitize_data(params or {})
        headers = self._get_headers(user_token)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, headers=headers, json=sanitized_params)
                return await self._handle_response(response, "rpc")
        except httpx.TimeoutException:
            logger.error("Supabase request timeout")
            raise HTTPException(status_code=504, detail="Database request timeout")
