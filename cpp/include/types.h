#pragma once
#include <vector>
#include <string>
#include <cmath>
#include <limits>
#include <algorithm>

namespace wlo {

struct Neighborhood { std::string id; double x=0, y=0; double demand=0; };
struct Candidate { std::string id; double x=0, y=0; double fixedCost=0; double capacity=1e18; };

struct Params {
    double deliveryCostPerKm = 2.0;
    double maxServiceRadius = 1e18;
    int minWarehouses = 1;
    int maxWarehouses = 3;
    double budget = 1e18;
    std::string distanceMetric = "euclidean"; // euclidean | manhattan | road
    double roadFactor = 1.35;
    std::string algorithm = "auto"; // greedy|kmeans|kmedoids|localsearch|exact|annealing|auto
    int randomSeed = 42;
    int saIterations = 8000;
};

struct Assignment { std::string neighborhoodId; std::string warehouseId; double distance=0; double cost=0; };
struct Solution {
    std::vector<std::string> openWarehouses;
    std::vector<Assignment> assignments;
    std::vector<std::string> unserved;
    double deliveryCost=0, fixedCost=0, totalCost=0, avgDistance=0;
    // warehouseId -> load
    std::vector<std::pair<std::string,double>> loads;
    std::vector<std::pair<std::string,double>> utilization; // 0..1+ (cap violation if >1)
    int capacityViolations=0, radiusViolations=0;
    double runtimeMs=0;
    std::string algorithmUsed;
    bool optimal=false; // true only if exact solver proved optimal
    std::string note;
};

const double INF = 1e100;

inline double euclid(double x1,double y1,double x2,double y2){
    double dx=x1-x2, dy=y1-y2;
    bool isGeoLatX = (x1 >= 6 && x1 <= 40) || (x2 >= 6 && x2 <= 40);
    bool isGeoLngY = (y1 >= 60 && y1 <= 100) || (y2 >= 60 && y2 <= 100);
    bool isGeoLatY = (y1 >= 6 && y1 <= 40) || (y2 >= 6 && y2 <= 40);
    bool isGeoLngX = (x1 >= 60 && x1 <= 100) || (x2 >= 60 && x2 <= 100);
    if (isGeoLatX && isGeoLngY) {
        dx = (x1 - x2) * 111.0;
        dy = (y1 - y2) * 108.2;
    } else if (isGeoLatY && isGeoLngX) {
        dx = (x1 - x2) * 108.2;
        dy = (y1 - y2) * 111.0;
    }
    return std::sqrt(dx*dx+dy*dy);
}
inline double manhattan(double x1,double y1,double x2,double y2){
    double dx=x1-x2, dy=y1-y2;
    bool isGeoLatX = (x1 >= 6 && x1 <= 40) || (x2 >= 6 && x2 <= 40);
    bool isGeoLngY = (y1 >= 60 && y1 <= 100) || (y2 >= 60 && y2 <= 100);
    bool isGeoLatY = (y1 >= 6 && y1 <= 40) || (y2 >= 6 && y2 <= 40);
    bool isGeoLngX = (x1 >= 60 && x1 <= 100) || (x2 >= 60 && x2 <= 100);
    if (isGeoLatX && isGeoLngY) {
        dx = (x1 - x2) * 111.0;
        dy = (y1 - y2) * 108.2;
    } else if (isGeoLatY && isGeoLngX) {
        dx = (x1 - x2) * 108.2;
        dy = (y1 - y2) * 111.0;
    }
    return std::fabs(dx)+std::fabs(dy);
}

} // namespace wlo
