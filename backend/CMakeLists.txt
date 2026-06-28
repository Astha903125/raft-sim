cmake_minimum_required(VERSION 3.16)
project(raft_sim CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_BUILD_TYPE Release)

# ── Dependencies via FetchContent ─────────────────────────────────────────────
include(FetchContent)

# Crow (HTTP + WebSocket server, header-only)
FetchContent_Declare(crow
    GIT_REPOSITORY https://github.com/CrowCpp/Crow.git
    GIT_TAG        v1.0+5
)
FetchContent_MakeAvailable(crow)

# nlohmann/json (header-only)
FetchContent_Declare(json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG        v3.11.3
)
FetchContent_MakeAvailable(json)

# ── Sources ───────────────────────────────────────────────────────────────────
add_executable(raft_sim
    src/main.cpp
    src/raft_node.cpp
)

target_include_directories(raft_sim PRIVATE include)

target_link_libraries(raft_sim PRIVATE
    Crow::Crow
    nlohmann_json::nlohmann_json
    pthread
)

# Crow needs Boost.Asio
find_package(Boost REQUIRED COMPONENTS system)
target_link_libraries(raft_sim PRIVATE Boost::system)
