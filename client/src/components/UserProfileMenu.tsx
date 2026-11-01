import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChessComLibraryAnalysis } from "../lib/ChessComLibraryAnalysis.ts";
import { chessComUserRepository } from "../repository/ChessComUserRepository.ts";

export default function UserProfileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const usersQuery = useQuery({
    queryKey: ChessComLibraryAnalysis.USERS_QUERY_KEY,
    queryFn: function loadUsers() {
      return chessComUserRepository.getAll();
    },
    refetchInterval: ChessComLibraryAnalysis.REFETCH_INTERVAL_MS,
  });
  const users = usersQuery.data ?? [];
  const current = users[0] ?? null;

  useEffect(
    function closeOnOutsideClickOrEscape() {
      if (!isOpen) return;
      function handleMouseDown(event: MouseEvent) {
        if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
      }
      function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") setIsOpen(false);
      }
      document.addEventListener("mousedown", handleMouseDown);
      document.addEventListener("keydown", handleKeyDown);
      return function cleanup() {
        document.removeEventListener("mousedown", handleMouseDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    },
    [isOpen],
  );

  function toggle() {
    if (!isOpen) void usersQuery.refetch();
    setIsOpen(!isOpen);
  }

  function selectUser(username: string) {
    chessComUserRepository.save({ username });
    setIsOpen(false);
    navigate(`/user/${encodeURIComponent(username)}`);
    void usersQuery.refetch();
  }

  function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const username = newUsername.trim();
    if (!username) return;
    setNewUsername("");
    setIsOpen(false);
    navigate(`/user/${encodeURIComponent(username)}`);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Profiles"
        title={current?.username ?? "Profiles"}
        className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold uppercase"
      >
        {current ? current.username[0] : "?"}
      </button>
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 z-30 min-w-48 rounded border border-gray-200 bg-white shadow-lg p-1 flex flex-col gap-1">
          {users.map((user) => (
            <button
              key={user.username}
              type="button"
              onClick={() => selectUser(user.username)}
              className={`px-2 py-1 text-left text-sm rounded ${user === current ? "bg-indigo-50 text-indigo-700 font-bold" : "text-gray-700 hover:bg-gray-100"}`}
            >
              {user.username}
            </button>
          ))}
          <form onSubmit={addUser} className="flex gap-1">
            <input
              value={newUsername}
              onChange={(event) => setNewUsername(event.target.value)}
              placeholder="Add Chess.com username"
              className="min-w-0 flex-1 px-2 py-1 text-sm rounded border border-gray-300 outline-none focus:border-indigo-500"
            />
            <button className="px-2 py-1 text-sm rounded bg-gray-800 text-white hover:bg-black">Add</button>
          </form>
        </div>
      )}
    </div>
  );
}
