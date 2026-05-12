import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import Prices from "./pages/Prices";
import ReviewList from "./pages/ReviewList";
import Review from "./pages/Review";
import RestaurantReview from "./pages/RestaurantReview";
import TransportReview from "./pages/TransportReview";
import Restaurants from "./pages/Restaurants";
import Transportation from "./pages/Transportation";
import AddHotel from "./pages/AddHotel";
import Hotels from "./pages/Hotels";
import Contracts from "./pages/Contracts";
import Settings from "./pages/Settings";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/review" element={<ReviewList />} />
          <Route path="/review/:documentId" element={<Review />} />
          <Route path="/review-restaurant/:documentId" element={<RestaurantReview />} />
          <Route path="/review-transportation/:documentId" element={<TransportReview />} />
          <Route path="/prices" element={<Prices />} />
          <Route path="/restaurants" element={<Restaurants />} />
          <Route path="/transportation" element={<Transportation />} />
          <Route path="/documents" element={<Navigate to="/review" replace />} />
          <Route path="/hotels" element={<Hotels />} />
          <Route path="/add-hotel" element={<AddHotel />} />
          <Route path="/edit-hotel/:hotelId" element={<AddHotel />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
