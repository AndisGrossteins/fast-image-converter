import { useEffect, useState } from "react";

const timestamp = new Date(BUILD_TIMESTAMP).toUTCString();

/**
 * The footer of the application.
 *
 * It renders a footer with information about the application and its
 * supported formats. It also includes a button to request permission for
 * notifications, and displays the current permission status.
 *
 * The component will only render if the browser supports the Notification API.
 *
 * @returns {JSX.Element} The footer component.
 */
export default function Footer() {
	const [notifiable, setNotifiable] = useState("granted");

	useEffect(() => {
		if ("Notification" in window) {
			setNotifiable(Notification.permission);
		}
	}, []);

	const requestPermission = () => {
		if ("Notification" in window) {
			Notification.requestPermission().then((result) => {
				setNotifiable(result);
			});
		}
	};

	return (
		<>
			<footer className="footer">
				<p className="msg">All photos are converted locally in your browser!</p>
				<p className="text-center color-secondary">
					Supported formats <br />
					.svg, .heif, .heic, .avif, .webp, .jpg, .png, .pdf
					VectorDrawable(.xml)
				</p>
				<p className="text-center text-sm color-secondary">
					Made with ❤️ by{" "}
					<a className="color-secondary" href="https://github.com/seanghay">
						@seanghay
					</a>
				</p>
				<p className="text-center text-sm color-secondary">{timestamp}</p>
				{notifiable !== "granted" ? (
					<div className="text-center">
						<button
							disabled={notifiable === "denied"}
							onClick={requestPermission}
							className="light small"
						>
							{notifiable === "default"
								? "Notify me once it's ready"
								: notifiable === "denied"
								? "Notification disabled"
								: ""}
						</button>
					</div>
				) : null}
			</footer>
		</>
	);
}
